const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizeEmailList,
    extractLatestReply,
    validatePayload,
    sanitizeRichTextHtml,
    renderEmailHtml,
} = require("../services/adminEmail.service");

test("normalizeEmailList accepts delimited strings and removes duplicates", () => {
    assert.deepEqual(
        normalizeEmailList("ONE@example.com, two@example.com; one@example.com"),
        ["one@example.com", "two@example.com"],
    );
});

test("extractLatestReply removes Proton signature and quoted history", () => {
    const body = `is this good right now ? did not hear from you

Sent with [Proton Mail](https://proton.me/mail/home) secure email.

On Wednesday, 9 September 2026 at 3:24 PM, Client <client@example.com> wrote:

> an older reply
>
> the original message`;

    assert.equal(extractLatestReply(body), "is this good right now ? did not hear from you");
});

test("extractLatestReply preserves ordinary multiline content", () => {
    assert.equal(
        extractLatestReply("Hello admin,\n\nHere is my requested document."),
        "Hello admin,\n\nHere is my requested document.",
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

test("sanitizeRichTextHtml keeps allowed formatting and safe links", () => {
    const clean = sanitizeRichTextHtml(
        '<h2>Title</h2><p><strong>Bold</strong> and <em>italic</em> and <a href="https://merlion.example/report">a link</a></p><ul><li>one</li></ul>',
    );
    assert.match(clean, /<h2>Title<\/h2>/);
    assert.match(clean, /<strong>Bold<\/strong>/);
    assert.match(clean, /<a href="https:\/\/merlion\.example\/report" target="_blank" rel="noopener noreferrer nofollow">a link<\/a>/);
    assert.match(clean, /<li>one<\/li>/);
});

test("sanitizeRichTextHtml strips scripts, event handlers, and unsafe protocols", () => {
    const clean = sanitizeRichTextHtml(
        '<p onclick="steal()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>',
    );
    assert.doesNotMatch(clean, /script/i);
    assert.doesNotMatch(clean, /onclick/i);
    assert.doesNotMatch(clean, /onerror/i);
    assert.doesNotMatch(clean, /javascript:/i);
    assert.doesNotMatch(clean, /<img/i);
    assert.doesNotMatch(clean, /<a /i);
    assert.match(clean, /hi/);
    assert.match(clean, /x/);
});

test("validatePayload derives a plain-text body from rich HTML when body is absent", () => {
    const payload = validatePayload({
        to: "client@example.com",
        subject: "Quarterly update",
        bodyHtml: "<h2>Hello</h2><p>See the <a href=\"https://x.example\">report</a>.</p>",
    });
    assert.match(payload.body, /Hello/);
    assert.match(payload.body, /report/);
    assert.match(payload.bodyHtml, /<h2>Hello<\/h2>/);
});

test("validatePayload rejects an HTML body that carries no visible text", () => {
    assert.throws(
        () => validatePayload({
            to: "client@example.com",
            subject: "Test",
            bodyHtml: "<p><br></p><div>&nbsp;</div>",
        }),
        /Message body is required/,
    );
});

test("renderEmailHtml inlines editor styles inside the branded shell", () => {
    const html = renderEmailHtml({
        body: "Hello",
        bodyHtml: "<h2>Heading</h2><p>Body copy</p>",
        senderName: "Investor Relations",
    });
    assert.match(html, /Merlion Asset Holdings administration system/);
    assert.match(html, /<h2 style="[^"]*font-weight:700/);
    assert.match(html, /Investor Relations/);
});
