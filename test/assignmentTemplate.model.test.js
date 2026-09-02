const test = require("node:test");
const assert = require("node:assert/strict");
const AssignmentTemplate = require("../models/assignmentTemplate.model");

const validPayload = () => ({
    title: "Financial analysis and investment judgement",
    role: "Senior Financial Analyst",
    summary: "<p>Evaluates financial judgement.</p>",
    instructions: "<p>Complete every required question.</p>",
    allowedResources: "<p>Calculator and spreadsheet software.</p>",
    estimatedMinutes: 120,
    questions: [
        {
            type: "mcq",
            title: "Risk-adjusted return",
            prompt: "<p>Select the correct metric.</p>",
            marks: 20,
            required: true,
            options: ["Sharpe ratio", "Current ratio"],
            referenceAnswer: "Sharpe ratio",
        },
        {
            type: "case-study",
            title: "Portfolio review",
            caseStudy: "<p>The portfolio fell by 12%.</p>",
            prompt: "<p>Recommend three actions.</p>",
            marks: 30,
            required: true,
            wordLimit: 500,
        },
        {
            type: "practical",
            title: "Financial model",
            prompt: "<p>Build and submit a financial model.</p>",
            marks: 30,
            required: true,
            acceptedFormats: ["xlsx", "PDF", "xlsx"],
        },
    ],
    status: "Published",
});

test("valid assignment calculates marks and normalizes formats", async () => {
    const assignment = new AssignmentTemplate(validPayload());
    await assignment.validate();

    assert.equal(assignment.totalMarks, 12);
    assert.deepEqual(
        assignment.questions.map((question) => question.marks),
        [2, 5, 5],
    );
    assert.deepEqual(assignment.questions[2].acceptedFormats, ["XLSX", "PDF"]);
});

test("rich-text-only markup is rejected", async () => {
    const assignment = new AssignmentTemplate({
        ...validPayload(),
        summary: "<p><br></p>",
    });

    await assert.rejects(assignment.validate(), /Summary must contain visible content/);
});

test("MCQ reference answer must match an option", async () => {
    const payload = validPayload();
    payload.questions[0].referenceAnswer = "Sortino ratio";
    const assignment = new AssignmentTemplate(payload);

    await assert.rejects(
        assignment.validate(),
        /MCQ reference answer must match one answer option/,
    );
});
