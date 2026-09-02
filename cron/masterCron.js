const cron = require("node-cron");

const CronExecution = require("../models/cronExecution.model");
const { processPortfolioMaturity } = require("./portfolioMaturity");
const { processSipAutoPayments } = require("./sipAutoPayment");
const { sendSipReminders } = require("./sipReminder");
const { registerCron, runCron, getEntry } = require("./cronManager");

const MASTER_CRONS = {
    morning: {
        name: "master_morning",
        label: "Morning Master Cron",
        schedule: "0 9 * * *",
        description: "Daily at 09:00 UTC — runs portfolio maturity, SIP reminders, then SIP auto-payment.",
        jobs: ["portfolio_maturity", "sip_reminder", "sip_auto_payment"],
    },
    evening: {
        name: "master_evening",
        label: "Evening Master Cron",
        schedule: "0 21 * * *",
        description: "Daily at 21:00 UTC — runs portfolio maturity only.",
        jobs: ["portfolio_maturity"],
    },
};

const DEFAULT_SERVICES = {
    portfolio_maturity: processPortfolioMaturity,
    sip_reminder: sendSipReminders,
    sip_auto_payment: processSipAutoPayments,
};

function getUtcDate(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function registerMasterCron(slot) {
    const definition = MASTER_CRONS[slot];
    if (!definition) throw new Error(`Unknown master cron slot: "${slot}".`);

    registerCron(
        definition.name,
        definition.label,
        definition.schedule,
        definition.description
    );
}

// Vercel can execute each request in a fresh serverless instance. Keep cron
// definitions available without resetting live in-memory state when this is
// called more than once in the same instance.
function ensureMasterCronsRegistered() {
    const registered = [];
    for (const [slot, definition] of Object.entries(MASTER_CRONS)) {
        if (getEntry(definition.name)) continue;
        registerMasterCron(slot);
        registered.push(definition.name);
    }
    return registered;
}

async function claimScheduledExecution(slot, now) {
    const definition = MASTER_CRONS[slot];
    const utcDate = getUtcDate(now);
    const executionKey = `${utcDate}:${definition.name}`;

    try {
        await CronExecution.create({
            _id: executionKey,
            cronName: definition.name,
            slot,
            utcDate,
            status: "running",
            outcome: "pending",
            startedAt: now,
        });
        return { claimed: true, executionKey, utcDate };
    } catch (error) {
        if (error?.code !== 11000) throw error;

        const existing = await CronExecution.findById(executionKey).lean();
        return {
            claimed: false,
            executionKey,
            utcDate,
            existingStatus: existing?.status ?? "unknown",
            existingOutcome: existing?.outcome ?? "unknown",
        };
    }
}

async function executeJobs(definition, services) {
    const jobs = {};
    const failures = [];

    // Keep this sequential. The reminder must be evaluated before a due SIP is
    // processed, and separate financial jobs should not compete for resources.
    for (const jobName of definition.jobs) {
        const startedAt = new Date();
        try {
            const result = await services[jobName]();
            jobs[jobName] = {
                status: "success",
                durationMs: Date.now() - startedAt.getTime(),
                result,
            };
        } catch (error) {
            jobs[jobName] = {
                status: "error",
                durationMs: Date.now() - startedAt.getTime(),
                error: error.message,
            };
            failures.push(jobName);
        }
    }

    return { jobs, failures };
}

async function executeMasterCron(slot, options = {}) {
    const definition = MASTER_CRONS[slot];
    if (!definition) throw new Error(`Unknown master cron slot: "${slot}".`);

    const now = options.now || new Date();
    const force = options.force === true;
    const services = options.services || DEFAULT_SERVICES;
    let claim = null;

    if (!force) {
        claim = await claimScheduledExecution(slot, now);
        if (!claim.claimed) {
            return {
                slot,
                cronName: definition.name,
                skipped: true,
                reason: "already_executed_for_utc_date",
                executionKey: claim.executionKey,
                existingStatus: claim.existingStatus,
                existingOutcome: claim.existingOutcome,
            };
        }
    }

    const { jobs, failures } = await executeJobs(definition, services);
    const result = {
        slot,
        cronName: definition.name,
        utcDate: getUtcDate(now),
        executionKey: claim?.executionKey ?? null,
        forced: force,
        skipped: false,
        jobs,
    };
    const errorMessage = failures.length
        ? `Master cron completed with failed jobs: ${failures.join(", ")}.`
        : null;

    if (claim?.executionKey) {
        await CronExecution.findByIdAndUpdate(claim.executionKey, {
            $set: {
                status: "completed",
                outcome: failures.length ? "error" : "success",
                finishedAt: new Date(),
                result,
                error: errorMessage,
            },
        });
    }

    if (failures.length) {
        const error = new Error(errorMessage);
        error.result = result;
        throw error;
    }

    return result;
}

function scheduleMasterCrons() {
    ensureMasterCronsRegistered();

    if (process.env.VERCEL === "1") {
        console.log("[Master Cron] Registered Vercel schedules (09:00 and 21:00 UTC)");
        return;
    }

    for (const [slot, definition] of Object.entries(MASTER_CRONS)) {
        cron.schedule(definition.schedule, async () => {
            try {
                const result = await runCron(
                    definition.name,
                    "schedule",
                    () => executeMasterCron(slot)
                );
                console.log(`[Master Cron] ${definition.label} completed`, result);
            } catch (error) {
                console.error(`[Master Cron] ${definition.label} failed:`, error.message);
            }
        }, { timezone: "UTC" });
    }

    console.log("[Master Cron] Scheduled at 09:00 and 21:00 UTC");
}

module.exports = {
    MASTER_CRONS,
    executeMasterCron,
    registerMasterCron,
    ensureMasterCronsRegistered,
    scheduleMasterCrons,
};
