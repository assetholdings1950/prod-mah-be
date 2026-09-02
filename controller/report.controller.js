const { getFinancialReportService } = require("../services/financialReport.service");

async function getFinancialReportController(req, res) {
    try {
        const report = await getFinancialReportService(req.query);
        return res.status(200).json(report);
    } catch (error) {
        console.error("[Financial Report]", error);
        return res.status(error.status || 500).json({
            status: false,
            message: error.message || "Failed to generate financial report.",
        });
    }
}

module.exports = { getFinancialReportController };
