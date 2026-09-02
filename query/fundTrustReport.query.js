const mongoose = require("mongoose");
const FundTrustReport = require("../models/fundTrustReport.model");
const InvestmentPlan = require("../models/investmentsplans.model");

const visibleText = (value) => String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const publicProjection = {
    internalNotes: 0,
    sourceReference: 0,
    reviewer: 0,
    checks: 0,
    createdBy: 0,
    updatedBy: 0,
};

function validatePublishedReport(payload) {
    if (payload.status !== "published") return;
    if (!visibleText(payload.summary)) throw Object.assign(new Error("Public summary is required before publishing."), { status_code: 400 });
    if (!visibleText(payload.methodology)) throw Object.assign(new Error("Calculation methodology is required before publishing."), { status_code: 400 });
    if (!String(payload.sourceReference || "").trim()) throw Object.assign(new Error("A source reference is required before publishing."), { status_code: 400 });
    const total = (payload.allocations || []).reduce((sum, item) => sum + Number(item.percentage || 0), 0);
    if (Math.abs(total - 100) > 0.001) throw Object.assign(new Error(`Capital allocation must total 100%. It currently totals ${total}%.`), { status_code: 400 });
    if (!Array.isArray(payload.checks) || !payload.checks.every(Boolean)) throw Object.assign(new Error("Complete every publication confirmation before publishing."), { status_code: 400 });
}

async function resolveFund(fundId) {
    if (!mongoose.isValidObjectId(fundId)) throw Object.assign(new Error("A valid fund is required."), { status_code: 400 });
    const fund = await InvestmentPlan.findById(fundId).select("name slug").lean();
    if (!fund) throw Object.assign(new Error("The selected fund does not exist."), { status_code: 404 });
    return fund;
}

const normalizeRows = (rows = []) => rows.map(({ id, rowId, ...row }) => ({ ...row, rowId: rowId || id || "" }));

function normalizePayload(body, userId) {
    const payload = { ...body };
    delete payload.id;
    delete payload._id;
    delete payload.fundName;
    delete payload.fundSnapshot;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.publishedAt;
    payload.activity = normalizeRows(payload.activity);
    payload.allocations = normalizeRows(payload.allocations);
    payload.profits = normalizeRows(payload.profits);
    payload.updatedBy = userId || null;
    return payload;
}

async function createFundTrustReport(body, userId) {
    const fund = await resolveFund(body.fundId || body.fund);
    const payload = normalizePayload(body, userId);
    payload.fund = fund._id;
    payload.fundSnapshot = { name: fund.name, slug: fund.slug };
    payload.createdBy = userId || null;
    validatePublishedReport(payload);
    return FundTrustReport.create(payload);
}

async function listFundTrustReports({ page = 1, limit = 20, search = "", status, fundId }) {
    const filter = {};
    if (["draft", "published"].includes(status)) filter.status = status;
    if (fundId && mongoose.isValidObjectId(fundId)) filter.fund = fundId;
    if (search.trim()) {
        const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
            { title: { $regex: safe, $options: "i" } },
            { "fundSnapshot.name": { $regex: safe, $options: "i" } },
        ];
    }
    const skip = (page - 1) * limit;
    const [items, total, counts] = await Promise.all([
        FundTrustReport.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        FundTrustReport.countDocuments(filter),
        FundTrustReport.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);
    const byStatus = { draft: 0, published: 0 };
    counts.forEach(({ _id, count }) => { if (_id in byStatus) byStatus[_id] = count; });
    return { items, total, page, limit, pages: Math.ceil(total / limit), counts: { all: byStatus.draft + byStatus.published, ...byStatus } };
}

async function getFundTrustReport(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    return FundTrustReport.findById(id).lean();
}

async function updateFundTrustReport(id, body, userId) {
    if (!mongoose.isValidObjectId(id)) return null;
    const current = await FundTrustReport.findById(id);
    if (!current) return null;
    const payload = normalizePayload(body, userId);
    if (body.fundId || body.fund) {
        const fund = await resolveFund(body.fundId || body.fund);
        payload.fund = fund._id;
        payload.fundSnapshot = { name: fund.name, slug: fund.slug };
    }
    const merged = { ...current.toObject(), ...payload };
    validatePublishedReport(merged);
    Object.assign(current, payload);
    return current.save();
}

async function deleteFundTrustReports(ids) {
    const validIds = [...new Set(ids || [])].filter((id) => mongoose.isValidObjectId(id));
    if (!validIds.length) throw Object.assign(new Error("Select at least one valid report."), { status_code: 400 });
    return FundTrustReport.deleteMany({ _id: { $in: validIds } });
}

async function listPublishedFundTrustReports({ fundId, fundSlug, limit = 12 }) {
    const filter = { status: "published", showPublicly: true };
    if (fundId && mongoose.isValidObjectId(fundId)) filter.fund = fundId;
    if (fundSlug) filter["fundSnapshot.slug"] = fundSlug;
    return FundTrustReport.find(filter, publicProjection).sort({ reportDate: -1, publishedAt: -1 }).limit(limit).lean();
}

module.exports = {
    createFundTrustReport,
    listFundTrustReports,
    getFundTrustReport,
    updateFundTrustReport,
    deleteFundTrustReports,
    listPublishedFundTrustReports,
};
