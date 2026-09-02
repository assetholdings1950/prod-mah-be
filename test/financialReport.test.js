const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFilters, scheduledInstallments } = require("../services/financialReport.service");

test("normalizes supported report filters", () => {
    const filters = normalizeFilters({
        from: "2026-07-01",
        to: "2026-07-31",
        currency: "trx",
        userModel: "Client",
        groupBy: "weekly",
    });
    assert.equal(filters.currency, "TRX");
    assert.equal(filters.userModel, "Client");
    assert.equal(filters.groupBy, "weekly");
    assert.equal(filters.start.toISOString(), "2026-07-01T00:00:00.000Z");
    assert.equal(filters.end.toISOString(), "2026-07-31T23:59:59.999Z");
});

test("rejects unsupported currencies", () => {
    assert.throws(
        () => normalizeFilters({ from: "2026-07-01", to: "2026-07-31", currency: "DOGE" }),
        error => error.status === 400
    );
});

test("counts recurring SIP due dates without counting the initial payment", () => {
    const portfolio = {
        startedAt: new Date("2026-01-17T10:00:00.000Z"),
        sip: { totalInstallments: 12 },
    };
    assert.equal(
        scheduledInstallments(portfolio, new Date("2026-02-01T00:00:00.000Z"), new Date("2026-04-30T23:59:59.999Z")),
        3
    );
    assert.equal(
        scheduledInstallments(portfolio, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-31T23:59:59.999Z")),
        0
    );
});
