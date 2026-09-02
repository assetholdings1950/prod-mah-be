const cron = require("node-cron");
const { checkMissedSipInstallmentsService } = require("../services/portfolio.service");
const { registerCron, runCron } = require("./cronManager");

const CRON_NAME = "sip_missed_installments";

function scheduleSipMissedInstallments() {
    registerCron(
        CRON_NAME,
        "SIP Missed Installments Checker",
        "0 0 * * *",
        "Daily at midnight — finds active SIP portfolios whose next due date has passed, increments missed count, advances due date, and pauses portfolios that have missed all installments."
    );

    cron.schedule("0 0 * * *", async () => {
        try {
            const result = await runCron(CRON_NAME, "schedule", checkMissedSipInstallmentsService);
            console.log(`[SIP Cron] Checked: ${result.checked} | Marked missed: ${result.missed}`);
        } catch (err) {
            console.error("[SIP Cron] Error:", err.message);
        }
    });

    console.log("[SIP Cron] Missed installment checker scheduled (daily at midnight)");
}

module.exports = scheduleSipMissedInstallments;
