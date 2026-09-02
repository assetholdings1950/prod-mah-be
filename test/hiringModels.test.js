const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const HiringApplication = require("../models/hiringApplication.model");
const HiringInterest = require("../models/hiringInterest.model");
const HiringInterview = require("../models/hiringInterview.model");
const HiringInterviewAvailability = require("../models/hiringInterviewAvailability.model");
const CandidateEvaluation = require("../models/candidateEvaluation.model");
const CandidateAssignment = require("../models/candidateAssignment.model");
const {
    sanitizeAssignmentForCandidate,
    sanitizeInterviewForCandidate,
    validateCandidateAnswers,
} = require("../query/hiring.query");

const objectId = () => new mongoose.Types.ObjectId();

const validApplication = () => ({
    reference: "MAH-HR-2026-0001",
    trackingTokenHash: "a".repeat(64),
    job: objectId(),
    jobSnapshot: { title: "Financial Analyst", location: "Singapore", type: "Full-time" },
    firstName: "Mira",
    lastName: "Tan",
    email: "mira@example.com",
    phoneNumber: "91234567",
    countryCode: "+65",
    country: "Singapore",
    city: "Singapore",
    highestQualification: "Bachelor of Finance",
    yearsOfExperience: 5,
    motivation: "I want to join Merlion because disciplined advice and client service are central to my professional standards.",
    consent: true,
    resume: {
        assetType: "resume",
        secureUrl: "https://res.cloudinary.com/demo/image/upload/resume.pdf",
        originalFilename: "resume.pdf",
    },
});

test("hiring application requires explicit consent and a country calling code", async () => {
    const application = new HiringApplication({ ...validApplication(), consent: false, countryCode: "" });
    await assert.rejects(application.validate(), /countryCode|consent/i);
});

test("hiring application enforces the optimized resume size limit", async () => {
    const payload = validApplication();
    payload.resume.optimizedBytes = 5 * 1024 * 1024 + 1;
    const application = new HiringApplication(payload);
    await assert.rejects(application.validate(), /Resume must not exceed 5MB/);
});

test("expression of interest accepts only a Cloudinary PDF resume", async () => {
    const interest = new HiringInterest({
        reference: "MAH-EOI-2026-0001",
        firstName: "Mira",
        lastName: "Tan",
        email: "mira@example.com",
        coverLetter: "I would like to bring disciplined analysis, careful client service, and accountable execution to the Merlion team.",
        resume: {
            secureUrl: "https://res.cloudinary.com/demo/image/upload/resume.pdf",
            originalFilename: "resume.pdf",
            format: "pdf",
            optimizedBytes: 1024,
        },
    });
    await interest.validate();
    interest.resume.format = "docx";
    await assert.rejects(interest.validate(), /PDF document/i);
});

test("interview end time must be later than start time", async () => {
    const interview = new HiringInterview({
        application: objectId(),
        applicationReference: "MAH-HR-2026-0001",
        candidateName: "Mira Tan",
        role: "Financial Analyst",
        startAt: new Date("2026-08-01T11:00:00Z"),
        endAt: new Date("2026-08-01T10:00:00Z"),
        type: "Role Interview",
        mode: "Video call",
    });
    await assert.rejects(interview.validate(), /end time must be after/i);
});

test("manual interview availability validates ranges and exposes a range index", async () => {
    const availability = new HiringInterviewAvailability({
        startAt: new Date("2026-08-03T04:00:00Z"),
        endAt: new Date("2026-08-03T03:00:00Z"),
        status: "Available",
    });
    await assert.rejects(availability.validate(), /end time must be after/i);
    const indexes = HiringInterviewAvailability.schema.indexes();
    assert.ok(indexes.some(([fields]) => fields.startAt === 1 && fields.endAt === 1));
});

test("evaluation computes a weighted manual score and requires 100 percent weight", async () => {
    const evaluation = new CandidateEvaluation({
        application: objectId(),
        criteria: [
            { id: "expertise", label: "Expertise", weight: 60, score: 4 },
            { id: "integrity", label: "Integrity", weight: 40, score: 5 },
        ],
        evidence: "Strong examples and clear ownership.",
        strengths: "Disciplined analysis.",
        recommendation: "Strong recommendation",
    });
    await evaluation.validate();
    assert.equal(evaluation.weightedScore, 4.4);

    evaluation.criteria[1].weight = 30;
    await assert.rejects(evaluation.validate(), /weights must total 100/i);
});

test("candidate assignment response never exposes private answers or internal review fields", () => {
    const assignment = new CandidateAssignment({
        application: objectId(),
        applicationReference: "MAH-HR-2026-0001",
        candidateName: "Mira Tan",
        role: "Financial Analyst",
        template: objectId(),
        title: "Risk judgement",
        dueAt: new Date("2026-08-10T12:00:00Z"),
        maximumScore: 20,
        templateSnapshot: {
            title: "Risk judgement",
            createdBy: objectId(),
            questions: [{ _id: "q1", prompt: "Choose", referenceAnswer: "Private answer" }],
        },
    });
    const safe = sanitizeAssignmentForCandidate(assignment);
    assert.equal(safe.template.questions[0].referenceAnswer, undefined);
    assert.equal(safe.template.createdBy, undefined);
    assert.equal(safe.reviewHistory, undefined);
});

test("candidate interview response omits notes, outcome, and recommendation", () => {
    const safe = sanitizeInterviewForCandidate({
        _id: objectId(),
        type: "Role Interview",
        startAt: new Date(),
        endAt: new Date(),
        mode: "Video call",
        locationOrLink: "https://meet.example.com/abc",
        interviewers: ["Hiring Admin"],
        status: "Scheduled",
        notes: "Internal note",
        outcome: "Internal outcome",
        recommendation: "Consider",
    });
    assert.equal(safe.notes, undefined);
    assert.equal(safe.outcome, undefined);
    assert.equal(safe.recommendation, undefined);
});

test("assignment submissions reject unknown MCQ options and unsafe practical files", () => {
    const questions = [
        { _id: "q1", type: "mcq", required: true, options: ["A", "B"] },
        { _id: "q2", type: "practical", required: true, acceptedFormats: ["PDF", "XLSX"] },
    ];
    assert.match(
        validateCandidateAnswers(questions, [
            { questionId: "q1", selectedOption: "C" },
            { questionId: "q2", attachments: [{ format: "PDF", bytes: 100 }] },
        ]),
        /multiple-choice/i,
    );
    assert.match(
        validateCandidateAnswers(questions, [
            { questionId: "q1", selectedOption: "A" },
            { questionId: "q2", attachments: [{ format: "EXE", bytes: 100 }] },
        ]),
        /invalid format/i,
    );
});
