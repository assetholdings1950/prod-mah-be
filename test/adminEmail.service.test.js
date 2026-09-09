const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizeEmailList,
    validatePayload,
} = require("../services/adminEmail.service");

test("normalizeEmailList accepts delimited strings and removes duplicates", () => {
    assert.deepEqual(
        normalizeEmailList("ONE@example.com, two@example.com; one@example.com"),
        ["one@example.com", "two@example.com"],
    );
});

test("normalizeEmailList extracts an address from a display-name mailbox", () => {
    assert.deepEqual(
        normalizeEmailList(["Client Name <CLIENT@example.com>"]),
        ["client@example.com"],
    );
});

test("validatePayload builds a sender only on the configured domain", () => {
    const previousDomain = process.env.EMAIL_SENDING_DOMAIN;
    process.env.EMAIL_SENDING_DOMAIN = "send.merlionassetholdings.com";
    try {
        const payload = validatePayload({
            to: "client@example.com",
            fromPrefix: "investor.relations",
            subject: "Account update",
            body: "Hello from Merlion.",
        });
        assert.equal(payload.fromAddress, "investor.relations@send.merlionassetholdings.com");
        assert.deepEqual(payload.to, ["client@example.com"]);
    } finally {
        if (previousDomain === undefined) delete process.env.EMAIL_SENDING_DOMAIN;
        else process.env.EMAIL_SENDING_DOMAIN = previousDomain;
    }
});

test("validatePayload rejects a full address as the sender prefix", () => {
    assert.throws(
        () => validatePayload({
            to: "client@example.com",
            fromPrefix: "spoof@example.net",
            subject: "Test",
            body: "Test body",
        }),
        /Sender prefix/,
    );
});

test("validatePayload requires a valid recipient, subject, and body", () => {
    assert.throws(
        () => validatePayload({ to: "not-an-email", subject: "Test", body: "Body" }),
        /Invalid email address/,
    );
    assert.throws(
        () => validatePayload({ to: "client@example.com", subject: "", body: "Body" }),
        /Subject is required/,
    );
    assert.throws(
        () => validatePayload({ to: "client@example.com", subject: "Test", body: "" }),
        /Message body is required/,
    );
});
