const CronLog = require("../models/cronLog.model");

// ── In-memory registry ────────────────────────────────────────────────────────
// Keyed by cronName. Populated at startup by each cron's init function.
const registry = {};

/**
 * Register a cron job so the admin dashboard can see it.
 * @param {string} name       Machine name, e.g. "portfolio_maturity"
 * @param {string} label      Human label, e.g. "Portfolio Maturity Checker"
 * @param {string} schedule   Cron expression, e.g. "0 * * * *"
 * @param {string} description One-line description
 */
function registerCron(name, label, schedule, description) {
    registry[name] = {
        name,
        label,
        schedule,
        description,
        state: "idle",        // "idle" | "running"
        lastRunAt: null,
        lastStatus: null,     // "success" | "error" | null
        lastResult: null,
        lastError: null,
        lastDurationMs: null,
        runCount: 0,
    };
}

/**
 * Wrap a cron job function with logging + state tracking.
 * @param {string} name         Registered cron name
 * @param {string} triggeredBy  "schedule" | "manual"
 * @param {Function} fn         Async function returning a result object
 */
async function runCron(name, triggeredBy, fn) {
    const entry = registry[name];
    if (!entry) throw new Error(`Cron "${name}" is not registered.`);
    if (entry.state === "running") throw new Error(`Cron "${name}" is already running.`);

    entry.state = "running";
    const startedAt = new Date();

    try {
        const result = await fn();

        const finishedAt = new Date();
        const durationMs = finishedAt - startedAt;

        entry.state = "idle";
        entry.lastRunAt = finishedAt;
        entry.lastStatus = "success";
        entry.lastResult = result;
        entry.lastError = null;
        entry.lastDurationMs = durationMs;
        entry.runCount += 1;

        await CronLog.create({ cronName: name, status: "success", result, error: null, startedAt, finishedAt, durationMs, triggeredBy });

        return result;
    } catch (err) {
        const finishedAt = new Date();
        const durationMs = finishedAt - startedAt;
        const errorResult = err.result ?? null;

        entry.state = "idle";
        entry.lastRunAt = finishedAt;
        entry.lastStatus = "error";
        entry.lastResult = errorResult;
        entry.lastError = err.message;
        entry.lastDurationMs = durationMs;
        entry.runCount += 1;

        await CronLog.create({ cronName: name, status: "error", result: errorResult, error: err.message, startedAt, finishedAt, durationMs, triggeredBy }).catch(() => {});

        throw err;
    }
}

function getRegistry() {
    return Object.values(registry);
}

function getEntry(name) {
    return registry[name] ?? null;
}

function resetRegistryStats() {
    for (const entry of Object.values(registry)) {
        entry.state = "idle";
        entry.lastRunAt = null;
        entry.lastStatus = null;
        entry.lastResult = null;
        entry.lastError = null;
        entry.lastDurationMs = null;
        entry.runCount = 0;
    }
}

module.exports = { registerCron, runCron, getRegistry, getEntry, resetRegistryStats };
