const test = require("node:test");
const assert = require("node:assert/strict");
const { buildActiveJobFilter } = require("../query/job.query");

test("active job filters combine keyword, location, and employment type", () => {
    const filter = buildActiveJobFilter({
        keyword: "analyst (senior)",
        location: "Remote",
        type: "Internship",
    });

    assert.equal(filter.status, "Active");
    assert.equal(filter.location, "Remote");
    assert.equal(filter.type, "Internship");
    assert.equal(filter.$or[0].title.test("Analyst (Senior)"), true);
    assert.equal(filter.$or[0].title.test("Analyst Senior"), false);
});

test("all values do not add location or type restrictions", () => {
    const filter = buildActiveJobFilter({ location: "all", type: "all" });
    assert.deepEqual(filter, { status: "Active" });
});
