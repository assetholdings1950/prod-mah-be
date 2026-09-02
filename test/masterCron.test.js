const assert = require("node:assert/strict");
const test = require("node:test");

// Prevent the email provider from requiring credentials while cron modules are
// imported. Injected test services below never send an email.
const mailModulePath = require.resolve("../emailTemplate/sendNotificationMail");
require.cache[mailModulePath] = {
    id: mailModulePath,
    filename: mailModulePath,
    loaded: true,
    exports: { default: async () => ({ id: "cron-test-email" }) },
};

const { MASTER_CRONS, executeMasterCron, ensureMasterCronsRegistered } = require("../cron/masterCron");
const CronExecution = require("../models/cronExecution.model");
const vercelConfig = require("../vercel.json");
const { registerCron, getEntry, resetRegistryStats } = require("../cron/cronManager");
const ActivityLog = require("../models/activityLog.model");

function serviceRecorder(order, failures = []) {
    const create = (name, result) => async () => {
        order.push(name);
        if (failures.includes(name)) throw new Error(`${name} failed for test`);
        return result;
    };

    return {
        portfolio_maturity: create("portfolio_maturity", { checked: 2, matured: 1 }),
        sip_reminder: create("sip_reminder", { checked: 3, reminded: 3 }),
        sip_auto_payment: create("sip_auto_payment", { checked: 1, paid: 1, failed: 0 }),
    };
}

test("morning master runs maturity, reminder, and auto-payment sequentially", async () => {
    const order = [];
    const result = await executeMasterCron("morning", {
        force: true,
        services: serviceRecorder(order),
        now: new Date("2026-07-15T09:00:00.000Z"),
    });

    assert.deepEqual(order, [
        "portfolio_maturity",
        "sip_reminder",
        "sip_auto_payment",
    ]);
    assert.equal(result.cronName, "master_morning");
    assert.equal(result.utcDate, "2026-07-15");
    assert.equal(result.forced, true);
    assert.equal(result.jobs.portfolio_maturity.status, "success");
    assert.equal(result.jobs.sip_reminder.status, "success");
    assert.equal(result.jobs.sip_auto_payment.status, "success");
});

test("morning master attempts later jobs when an earlier child fails", async () => {
    const order = [];

    await assert.rejects(
        () => executeMasterCron("morning", {
            force: true,
            services: serviceRecorder(order, ["sip_reminder"]),
        }),
        error => {
            assert.match(error.message, /sip_reminder/);
            assert.equal(error.result.jobs.sip_reminder.status, "error");
            assert.equal(error.result.jobs.sip_auto_payment.status, "success");
            return true;
        }
    );

    assert.deepEqual(order, [
        "portfolio_maturity",
        "sip_reminder",
        "sip_auto_payment",
    ]);
});

test("evening master runs portfolio maturity only", async () => {
    const order = [];
    const result = await executeMasterCron("evening", {
        force: true,
        services: serviceRecorder(order),
    });

    assert.deepEqual(order, ["portfolio_maturity"]);
    assert.equal(result.cronName, "master_evening");
    assert.deepEqual(Object.keys(result.jobs), ["portfolio_maturity"]);
});

test("a duplicate scheduled slot is skipped across instances for the same UTC date", async () => {
    const documents = new Map();
    const originalCreate = CronExecution.create;
    const originalFindById = CronExecution.findById;
    const originalFindByIdAndUpdate = CronExecution.findByIdAndUpdate;

    CronExecution.create = async document => {
        if (documents.has(document._id)) {
            const error = new Error("duplicate execution key");
            error.code = 11000;
            throw error;
        }
        documents.set(document._id, { ...document });
        return document;
    };
    CronExecution.findById = id => ({
        lean: async () => documents.get(id) ?? null,
    });
    CronExecution.findByIdAndUpdate = async (id, update) => {
        const document = documents.get(id);
        documents.set(id, { ...document, ...update.$set });
        return documents.get(id);
    };

    try {
        const order = [];
        const options = {
            services: serviceRecorder(order),
            now: new Date("2026-07-15T09:00:00.000Z"),
        };

        const first = await executeMasterCron("morning", options);
        const duplicate = await executeMasterCron("morning", options);

        assert.equal(first.skipped, false);
        assert.equal(duplicate.skipped, true);
        assert.equal(duplicate.reason, "already_executed_for_utc_date");
        assert.deepEqual(order, [
            "portfolio_maturity",
            "sip_reminder",
            "sip_auto_payment",
        ]);
    } finally {
        CronExecution.create = originalCreate;
        CronExecution.findById = originalFindById;
        CronExecution.findByIdAndUpdate = originalFindByIdAndUpdate;
    }
});

test("unknown master slots are rejected", async () => {
    await assert.rejects(
        () => executeMasterCron("midnight", { force: true, services: {} }),
        /Unknown master cron slot/
    );
});

test("Vercel configuration contains exactly the two UTC master schedules", () => {
    assert.deepEqual(vercelConfig.crons, [
        {
            path: "/cron/vercel/master/morning",
            schedule: MASTER_CRONS.morning.schedule,
        },
        {
            path: "/cron/vercel/master/evening",
            schedule: MASTER_CRONS.evening.schedule,
        },
    ]);
});

test("cold-start registration is idempotent and preserves live registry state", () => {
    ensureMasterCronsRegistered();
    const morning = getEntry("master_morning");
    const evening = getEntry("master_evening");
    morning.runCount = 7;

    const registered = ensureMasterCronsRegistered();

    assert.deepEqual(registered, []);
    assert.equal(getEntry("master_morning"), morning);
    assert.equal(getEntry("master_evening"), evening);
    assert.equal(getEntry("master_morning").runCount, 7);
});

test("deleting cron data can reset every in-memory status field", () => {
    registerCron("reset_test", "Reset Test", "0 0 * * *", "Test-only registry entry");
    const entry = getEntry("reset_test");
    entry.state = "running";
    entry.lastRunAt = new Date();
    entry.lastStatus = "error";
    entry.lastResult = { checked: 1 };
    entry.lastError = "test error";
    entry.lastDurationMs = 50;
    entry.runCount = 4;

    resetRegistryStats();

    assert.equal(entry.state, "idle");
    assert.equal(entry.lastRunAt, null);
    assert.equal(entry.lastStatus, null);
    assert.equal(entry.lastResult, null);
    assert.equal(entry.lastError, null);
    assert.equal(entry.lastDurationMs, null);
    assert.equal(entry.runCount, 0);
});

test("system cron activity can be attributed to an administrator", () => {
    const activity = new ActivityLog({
        userId: null,
        userModel: "System",
        action: "cron.master_morning.manual_run",
        category: "system",
        description: "Administrator manually executed the morning master cron.",
        performedBy: {
            role: "superadmin",
            name: "admin@example.com",
        },
    });

    assert.equal(activity.validateSync(), undefined);
    assert.equal(activity.userModel, "System");
    assert.equal(activity.performedBy.role, "superadmin");
    assert.equal(activity.performedBy.name, "admin@example.com");
});
