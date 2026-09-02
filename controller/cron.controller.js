const asyncHandler = require("express-async-handler");
const CronLog = require("../models/cronLog.model");
const CronExecution = require("../models/cronExecution.model");
const { getRegistry, getEntry, runCron, resetRegistryStats } = require("../cron/cronManager");
const {
    MASTER_CRONS,
    executeMasterCron,
    registerMasterCron,
    ensureMasterCronsRegistered,
} = require("../cron/masterCron");
const { logActivity } = require("../utils/activityLogger");

function adminPerformer(req) {
    const roles = Array.isArray(req.user?.role) ? req.user.role : [req.user?.role].filter(Boolean);
    const role = roles
        .map(item => typeof item === "string" ? item : item?.roleCode || item?.roleName)
        .filter(Boolean)
        .join(", ") || req.user?.model || "admin";

    return {
        id: req.user?.sub ?? null,
        role,
        name: req.user?.email || "Administrator",
    };
}

function systemPerformer() {
    return { id: null, role: "system", name: "Vercel Cron" };
}

async function recordCronActivity({ req, action, description, metadata, notification, performedBy }) {
    await logActivity({
        userId: null,
        userModel: "System",
        action,
        category: "system",
        description,
        metadata,
        performedBy: performedBy || adminPerformer(req),
        notification: {
            actionRequired: false,
            entity: {
                model: "CronExecution",
                id: null,
                reference: metadata?.cronName || metadata?.scope || "cron-system",
                label: "Cron Scheduler",
                url: "/system/cron",
                state: metadata?.status || null,
            },
            ...notification,
        },
    });
}

// Map of cron name → service function for manual triggers
const SERVICE_MAP = {
    master_morning: () => executeMasterCron("morning", { force: true }),
    master_evening: () => executeMasterCron("evening", { force: true }),
};

// GET /cron/vercel/master/:slot — invoked by Vercel Cron with CRON_SECRET.
const triggerVercelCronController = asyncHandler(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ status: false, message: "Unauthorized cron invocation." });
    }

    const { slot } = req.params;
    const definition = MASTER_CRONS[slot];
    if (!definition) {
        return res.status(404).json({ status: false, message: "Unknown master cron slot." });
    }

    // Defensive registration for serverless cold starts where the request
    // handler can be initialized independently of the traditional listener.
    if (!getEntry(definition.name)) {
        registerMasterCron(slot);
    }

    try {
        const result = await runCron(
            definition.name,
            "schedule",
            () => executeMasterCron(slot)
        );
        const skipped = result?.skipped === true;

        await recordCronActivity({
            req,
            action: skipped ? `cron.${definition.name}.duplicate_skipped` : `cron.${definition.name}.scheduled_completed`,
            description: skipped
                ? `${definition.label} duplicate scheduled invocation was safely skipped.`
                : `${definition.label} completed its scheduled UTC execution.`,
            metadata: { cronName: definition.name, slot, status: skipped ? "skipped" : "success", result },
            performedBy: systemPerformer(),
            notification: {
                title: skipped ? "Duplicate Cron Run Prevented" : `${definition.label} Completed`,
                priority: "low",
                footprints: [
                    { label: "Vercel invocation received", description: `${definition.schedule} UTC schedule` },
                    { label: skipped ? "Duplicate lock matched" : "Master workflow executed", description: skipped ? "No child job was executed twice" : "Child-job results were persisted" },
                    { label: "System event recorded", description: "Visible to administrators in notifications and activity logs" },
                ],
            },
        });

        return res.status(200).json({ status: true, cron: definition.name, result });
    } catch (error) {
        await recordCronActivity({
            req,
            action: `cron.${definition.name}.scheduled_failed`,
            description: `${definition.label} failed during its scheduled UTC execution.`,
            metadata: { cronName: definition.name, slot, status: "error", error: error.message, result: error.result ?? null },
            performedBy: systemPerformer(),
            notification: {
                title: `${definition.label} Failed`,
                priority: "critical",
                actionRequired: true,
                footprints: [
                    { label: "Vercel invocation received", description: `${definition.schedule} UTC schedule` },
                    { label: "Master workflow failed", description: error.message },
                    { label: "Administrator review required", description: "Inspect the cron execution result and logs" },
                ],
            },
        });
        throw error;
    }
});

// ── GET /cron/status ──────────────────────────────────────────────────────────
// Returns live in-memory status of every registered cron
const getCronStatusController = asyncHandler(async (_req, res) => {
    // A status request may land on a Vercel cold-start instance that has not
    // handled either scheduled endpoint yet. Registration is idempotent and
    // does not execute a job or bypass the persistent duplicate lock.
    ensureMasterCronsRegistered();
    const crons = getRegistry();
    const persisted = await CronLog.aggregate([
        { $sort: { startedAt: -1 } },
        {
            $group: {
                _id: "$cronName",
                lastRun: { $first: "$$ROOT" },
                runCount: { $sum: 1 },
            },
        },
    ]);
    const persistedByName = new Map(persisted.map(item => [item._id, item]));
    const mergedCrons = crons.map(cron => {
        const saved = persistedByName.get(cron.name);
        if (!saved) return cron;
        return {
            ...cron,
            lastRunAt: saved.lastRun.finishedAt || saved.lastRun.startedAt,
            lastStatus: saved.lastRun.status,
            lastResult: saved.lastRun.result,
            lastError: saved.lastRun.error,
            lastDurationMs: saved.lastRun.durationMs,
            runCount: saved.runCount,
        };
    });
    return res.status(200).json({ status: true, crons: mergedCrons });
});

// ── GET /cron/logs ────────────────────────────────────────────────────────────
// Paginated history of all cron runs
const getCronLogsController = asyncHandler(async (req, res) => {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(100, parseInt(req.query.limit) || 20);
    const cronName = req.query.cronName || null;
    const status   = req.query.status   || null;

    const filter = {};
    if (cronName) filter.cronName = cronName;
    if (status)   filter.status   = status;

    const [logs, total] = await Promise.all([
        CronLog.find(filter)
            .sort({ startedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        CronLog.countDocuments(filter),
    ]);

    return res.status(200).json({
        status:     true,
        logs,
        totalDocs:  total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
    });
});

// ── DELETE /cron/delete-all ──────────────────────────────────────────────────
// Deletes persisted run history and scheduled idempotency keys. Registered
// schedules remain active and their in-memory statistics are reset.
const deleteAllCronDataController = asyncHandler(async (req, res) => {
    const running = getRegistry().filter(entry => entry.state === "running");
    if (running.length) {
        return res.status(409).json({
            status: false,
            message: `Cannot delete cron data while running: ${running.map(entry => entry.label).join(", ")}.`,
        });
    }

    const [logsResult, executionsResult] = await Promise.all([
        CronLog.deleteMany({}),
        CronExecution.deleteMany({}),
    ]);

    resetRegistryStats();

    await recordCronActivity({
        req,
        action: "cron.data.deleted_all",
        description: `${adminPerformer(req).name} deleted all cron history and execution locks.`,
        metadata: {
            scope: "all_cron_data",
            status: "completed",
            deletedLogs: logsResult.deletedCount ?? 0,
            deletedExecutions: executionsResult.deletedCount ?? 0,
        },
        notification: {
            title: "All Cron Data Deleted",
            priority: "high",
            footprints: [
                { label: "Deletion confirmed", description: `Confirmed by ${adminPerformer(req).name}` },
                { label: "Cron logs deleted", description: `${logsResult.deletedCount ?? 0} record(s) removed` },
                { label: "Execution locks deleted", description: `${executionsResult.deletedCount ?? 0} lock(s) removed` },
            ],
        },
    });

    return res.status(200).json({
        status: true,
        message: "All cron run history and execution locks were deleted.",
        deleted: {
            logs: logsResult.deletedCount ?? 0,
            executions: executionsResult.deletedCount ?? 0,
        },
    });
});

// ── POST /cron/run/:name ──────────────────────────────────────────────────────
// Manually trigger a cron job (superadmin only)
const triggerCronController = asyncHandler(async (req, res) => {
    const { name } = req.params;

    const entry = getEntry(name);
    if (!entry) {
        return res.status(404).json({ status: false, message: `Unknown cron: "${name}".` });
    }

    const fn = SERVICE_MAP[name];
    if (!fn) {
        return res.status(400).json({ status: false, message: `No service mapped for cron "${name}".` });
    }

    if (entry.state === "running") {
        return res.status(409).json({ status: false, message: `Cron "${name}" is already running.` });
    }

    try {
        const result = await runCron(name, "manual", fn);
        await recordCronActivity({
            req,
            action: `cron.${name}.manual_run`,
            description: `${adminPerformer(req).name} manually executed ${entry.label}.`,
            metadata: { cronName: name, status: "success", result },
            notification: {
                title: `${entry.label} Manually Executed`,
                priority: "medium",
                footprints: [
                    { label: "Manual run requested", description: `Requested by ${adminPerformer(req).name}` },
                    { label: "Master workflow completed", description: "Execution result was persisted" },
                    { label: "Admin action recorded", description: "The responsible administrator is attached to this event" },
                ],
            },
        });
        return res.status(200).json({ status: true, message: `Cron "${name}" completed.`, result });
    } catch (error) {
        await recordCronActivity({
            req,
            action: `cron.${name}.manual_failed`,
            description: `${adminPerformer(req).name} manually executed ${entry.label}, but it failed.`,
            metadata: { cronName: name, status: "error", error: error.message, result: error.result ?? null },
            notification: {
                title: `Manual ${entry.label} Failed`,
                priority: "high",
                actionRequired: true,
                footprints: [
                    { label: "Manual run requested", description: `Requested by ${adminPerformer(req).name}` },
                    { label: "Master workflow failed", description: error.message },
                    { label: "Administrator review required", description: "Inspect cron logs before retrying" },
                ],
            },
        });
        throw error;
    }
});

module.exports = {
    getCronStatusController,
    getCronLogsController,
    deleteAllCronDataController,
    triggerCronController,
    triggerVercelCronController,
};
