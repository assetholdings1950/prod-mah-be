const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const HiringEmailLog = require("../models/hiringEmailLog.model");
const {
    EMAIL_TYPES,
    buildHiringEmailTemplate,
    renderHiringEmail,
    getStageEmailType,
    getInterviewUpdateEmailType,
    getAssignmentUpdateEmailType,
    formatDateTime,
} = require("../services/hiringEmail.service");

const application = {
    _id: new mongoose.Types.ObjectId(),
    reference: "MAH-HR-2026-0021",
    firstName: "Mira <script>",
    email: "mira@example.com",
    jobSnapshot: { title: "Senior Financial Analyst" },
};

const context = {
    trackingToken: "private-token",
    otp: "123456",
    applicationCount: 2,
    stage: "Screening",
    interviewType: "Role Interview",
    startAt: "2026-08-10T03:00:00.000Z",
    mode: "Video call",
    locationOrLink: "https://meet.example.com/abc",
    interviewers: ["Hiring Admin"],
    assignmentTitle: "Financial judgement paper",
    kind: "Assignment",
    dueAt: "2026-08-12T12:00:00.000Z",
    submittedAt: "2026-08-11T10:00:00.000Z",
    result: "Passed",
};

test("all 13 approved hiring email templates render successfully", () => {
    const types = Object.values(EMAIL_TYPES);
    assert.equal(types.length, 13);
    for (const type of types) {
        const template = buildHiringEmailTemplate({ type, application, context });
        assert.ok(template.subject);
        assert.ok(template.title);
        const html = renderHiringEmail(template);
        assert.match(html, /Merlion Asset Holdings/);
        assert.match(html, /https:\/\/www\.merlionassetholdings\.com\/hiring/);
        assert.doesNotMatch(html, /https:\/\/merlionasset\.com/);
        assert.doesNotMatch(html, /Mira <script>/);
        assert.match(html, /Mira &lt;script&gt;/);
    }
});

test("stage changes choose success, rejection, or progress emails", () => {
    assert.equal(getStageEmailType("Hired"), EMAIL_TYPES.APPLICATION_SUCCESSFUL);
    assert.equal(getStageEmailType("Rejected"), EMAIL_TYPES.APPLICATION_UNSUCCESSFUL);
    assert.equal(
        getStageEmailType("Screening"),
        EMAIL_TYPES.APPLICATION_PROGRESS_UPDATED,
    );
});

test("interview email is only selected for candidate-visible scheduling changes", () => {
    const before = {
        status: "Scheduled",
        startAt: "2026-08-10T03:00:00.000Z",
        endAt: "2026-08-10T04:00:00.000Z",
        type: "Role Interview",
        mode: "Video call",
        locationOrLink: "A",
    };
    assert.equal(getInterviewUpdateEmailType(before, { ...before }), null);
    assert.equal(
        getInterviewUpdateEmailType(before, { ...before, startAt: "2026-08-11T03:00:00.000Z" }),
        EMAIL_TYPES.INTERVIEW_RESCHEDULED,
    );
    assert.equal(
        getInterviewUpdateEmailType(before, { ...before, status: "Cancelled" }),
        EMAIL_TYPES.INTERVIEW_CANCELLED,
    );
});

test("assignment publication and deadline edits choose the correct email", () => {
    assert.equal(
        getAssignmentUpdateEmailType(
            { status: "Draft", dueAt: "2026-08-10" },
            { status: "Published", dueAt: "2026-08-10" },
        ),
        EMAIL_TYPES.ASSIGNMENT_ASSIGNED,
    );
    assert.equal(
        getAssignmentUpdateEmailType(
            { status: "Published", dueAt: "2026-08-10" },
            { status: "Published", dueAt: "2026-08-12" },
        ),
        EMAIL_TYPES.ASSIGNMENT_DEADLINE_UPDATED,
    );
});

test("email event key has a unique index for duplicate-send protection", () => {
    const eventIndex = HiringEmailLog.schema
        .indexes()
        .find(([fields]) => fields.eventKey === 1);
    assert.ok(eventIndex);
    assert.equal(eventIndex[1].unique, true);
});

test("Singapore hiring timestamps include the expected local time", () => {
    assert.match(formatDateTime("2026-08-10T03:00:00.000Z"), /11:00/);
});
