const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const FundTrustReport = require("../models/fundTrustReport.model");

const baseReport = () => ({
    fund: new mongoose.Types.ObjectId(),
    fundSnapshot: { name: "Merlion Test Fund", slug: "merlion-test-fund" },
    title: "Weekly trust report",
    reportDate: "2026-08-13",
    reportTime: "16:30",
    summary: "<p>Summary</p>",
    activity: [{ rowId: "a1", label: "Last 7 days", days: 7, from: "2026-08-07", to: "2026-08-13", clients: 12, capital: 1420000 }],
    allocations: [{ rowId: "b1", name: "Infrastructure", percentage: 100 }],
    profits: [{ rowId: "c1", label: "Last 7 days", days: 7, from: "2026-08-07", to: "2026-08-13", profit: 5400, returnPercentage: 0.38 }],
});

test("draft reports remain hidden from clients", async () => {
    const report = new FundTrustReport(baseReport());
    await report.validate();
    assert.equal(report.status, "draft");
    assert.equal(report.showPublicly, false);
    assert.equal(report.publishedAt, null);
});

test("published reports become public and receive a publication timestamp", async () => {
    const report = new FundTrustReport({ ...baseReport(), status: "published" });
    await report.validate();
    assert.equal(report.showPublicly, true);
    assert.ok(report.publishedAt instanceof Date);
});

test("activity cannot contain negative client counts", async () => {
    const data = baseReport();
    data.activity[0].clients = -1;
    const report = new FundTrustReport(data);
    await assert.rejects(report.validate(), /less than minimum allowed value/);
});
