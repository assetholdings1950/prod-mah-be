const mongoose = require("mongoose");

const hasRichTextContent = (value) =>
    typeof value === "string" &&
    value
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim().length > 0;

const QUESTION_MARKS = Object.freeze({
    mcq: 2,
    explanation: 2,
    "case-study": 5,
    practical: 5,
});

const questionSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["mcq", "explanation", "case-study", "practical"],
            required: true,
        },
        title: { type: String, required: true, trim: true },
        prompt: {
            type: String,
            required: true,
            validate: {
                validator: hasRichTextContent,
                message: "Question prompt must contain visible content",
            },
        },
        marks: { type: Number, required: true, min: 1, max: 100 },
        required: { type: Boolean, default: true },
        options: { type: [String], default: undefined },
        referenceAnswer: { type: String, default: "" },
        wordLimit: { type: Number, min: 50, max: 5000 },
        caseStudy: { type: String },
        acceptedFormats: { type: [String], default: undefined },
    },
    { _id: true },
);

questionSchema.pre("validate", function validateQuestion(next) {
    this.marks = QUESTION_MARKS[this.type];

    if (this.type === "mcq") {
        const options = (this.options || []).map((option) => option.trim()).filter(Boolean);
        if (options.length < 2) {
            return next(new Error("Multiple-choice questions require at least two options"));
        }
        if (!this.referenceAnswer || !options.includes(this.referenceAnswer)) {
            return next(new Error("The MCQ reference answer must match one answer option"));
        }
        this.options = options;
    }

    if (this.type === "case-study" && !hasRichTextContent(this.caseStudy)) {
        return next(new Error("Case-study questions require case-study material"));
    }

    if (this.type === "practical") {
        const formats = (this.acceptedFormats || [])
            .map((format) => format.trim().toUpperCase())
            .filter(Boolean);
        if (formats.length === 0) {
            return next(new Error("Practical questions require at least one accepted file format"));
        }
        this.acceptedFormats = [...new Set(formats)];
    }

    next();
});

const assignmentTemplateSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        role: { type: String, required: true, trim: true },
        summary: {
            type: String,
            required: true,
            validate: {
                validator: hasRichTextContent,
                message: "Summary must contain visible content",
            },
        },
        instructions: {
            type: String,
            required: true,
            validate: {
                validator: hasRichTextContent,
                message: "Instructions must contain visible content",
            },
        },
        allowedResources: {
            type: String,
            required: true,
            validate: {
                validator: hasRichTextContent,
                message: "Allowed resources must contain visible content",
            },
        },
        estimatedMinutes: { type: Number, required: true, min: 15, max: 480 },
        questions: {
            type: [questionSchema],
            required: true,
            validate: {
                validator: (questions) => Array.isArray(questions) && questions.length > 0,
                message: "An assignment requires at least one question",
            },
        },
        totalMarks: { type: Number, required: true, min: 1 },
        resubmissionPolicy: {
            type: String,
            enum: [
                "No resubmission allowed",
                "One resubmission with Hiring Admin approval",
                "Resubmission only for documented technical issues",
            ],
            default: "One resubmission with Hiring Admin approval",
        },
        candidateNotes: { type: String, default: "" },
        attachmentNames: { type: [String], default: [] },
        status: { type: String, enum: ["Draft", "Published"], default: "Draft" },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true },
);

assignmentTemplateSchema.pre("validate", function calculateTotalMarks(next) {
    (this.questions || []).forEach((question) => {
        question.marks = QUESTION_MARKS[question.type];
    });
    this.totalMarks = (this.questions || []).reduce(
        (total, question) => total + Number(question.marks || 0),
        0,
    );
    next();
});

assignmentTemplateSchema.index({ status: 1, role: 1, createdAt: -1 });
assignmentTemplateSchema.index({ title: "text", role: "text" });

module.exports = mongoose.model("AssignmentTemplate", assignmentTemplateSchema);
