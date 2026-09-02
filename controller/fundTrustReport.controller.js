const queries = require("../query/fundTrustReport.query");

const serialize = (report) => {
    const value = report?.toObject ? report.toObject() : report;
    if (!value) return value;
    return {
        ...value,
        id: String(value._id),
        fundId: String(value.fund),
        fundName: value.fundSnapshot?.name || "Fund",
        activity: (value.activity || []).map(({ rowId, ...row }) => ({ ...row, id: rowId })),
        allocations: (value.allocations || []).map(({ rowId, ...row }) => ({ ...row, id: rowId })),
        profits: (value.profits || []).map(({ rowId, ...row }) => ({ ...row, id: rowId })),
    };
};

exports.createFundTrustReportController = async (req, res, next) => {
    try {
        const report = await queries.createFundTrustReport(req.body, req.user?.sub);
        return res.status(201).json({ status: true, message: "Fund report created.", report: serialize(report) });
    } catch (error) { next(error); }
};

exports.listFundTrustReportsController = async (req, res, next) => {
    try {
        const result = await queries.listFundTrustReports({
            page: Math.max(1, Number(req.query.page) || 1),
            limit: Math.min(100, Math.max(1, Number(req.query.limit) || 20)),
            search: req.query.search || "",
            status: req.query.status,
            fundId: req.query.fundId,
        });
        return res.json({ status: true, ...result, items: result.items.map(serialize) });
    } catch (error) { next(error); }
};

exports.getFundTrustReportController = async (req, res, next) => {
    try {
        const report = await queries.getFundTrustReport(req.params.id);
        if (!report) return res.status(404).json({ status: false, message: "Fund report not found." });
        return res.json({ status: true, report: serialize(report) });
    } catch (error) { next(error); }
};

exports.updateFundTrustReportController = async (req, res, next) => {
    try {
        const report = await queries.updateFundTrustReport(req.params.id, req.body, req.user?.sub);
        if (!report) return res.status(404).json({ status: false, message: "Fund report not found." });
        return res.json({ status: true, message: "Fund report updated.", report: serialize(report) });
    } catch (error) { next(error); }
};

exports.deleteFundTrustReportsController = async (req, res, next) => {
    try {
        const result = await queries.deleteFundTrustReports(req.body?.ids);
        return res.json({ status: true, message: `${result.deletedCount} fund report(s) deleted.`, deletedCount: result.deletedCount });
    } catch (error) { next(error); }
};

exports.listPublishedFundTrustReportsController = async (req, res, next) => {
    try {
        const reports = await queries.listPublishedFundTrustReports({
            fundId: req.query.fundId,
            fundSlug: req.query.fundSlug,
            limit: Math.min(50, Math.max(1, Number(req.query.limit) || 12)),
        });
        return res.json({ status: true, reports: reports.map(serialize) });
    } catch (error) { next(error); }
};
