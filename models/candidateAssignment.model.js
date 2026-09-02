const mongoose = require("mongoose");

const isCloudinaryUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
    } catch {
        return false;
    }
};

const answerAttachmentSchema = new mongoose.Schema(
    {
        secureUrl: {
            type: String,
            required: true,
            validate: { validator: isCloudinaryUrl, message: "Submission files must use a secure Cloudinary URL" },
        },
        publicId: { type: String, default: "" },
        originalFilename: { type: String, required: true },
        format: { type: String, default: "" },
        bytes: { type: Number, min: 0, max: 26214400 },
    },
    { _id: true },
);

const answerSchema = new mongoose.Schema(
    {
        questionId: { type: String, required: true },
        selectedOption: { type: String, default: "" },
        textAnswer: { type: String, default: "" },
        attachments: { type: [answerAttachmentSchema], default: [] },
    },
    { _id: false },
);

const questionReviewSchema = new mongoose.Schema(
    {
        questionId: { type: String, required: true },
        awardedMarks: { type: Number, required: true, min: 0 },
        maximumMarks: { type: Number, required: true, min: 1 },
        autoScored: { type: Boolean, default: false },
        feedback: { type: String, default: "" },
    },
    { _id: false },
);

const reviewHistorySchema = new mongoose.Schema(
    {
        status: { type: String, required: true },
        score: { type: Number, default: null },
        feedback: { type: String, default: "" },
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewerLabel: { type: String, default: "Hiring Admin" },
        questionReviews: { type: [questionReviewSchema], default: [] },
        at: { type: Date, default: Date.now },
    },
    { _id: true },
);

const candidateAssignmentSchema = new mongoose.Schema(
    {
        application: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "HiringApplication",
            required: true,
            index: true,
        },
        applicationReference: { type: String, required: true, index: true },
        candidateName: { type: String, required: true },
        role: { type: String, required: true },
        template: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AssignmentTemplate",
            required: true,
            index: true,
        },
        templateSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
        title: { type: String, required: true },
        kind: { type: String, enum: ["Assignment", "Online exam"], default: "Assignment" },
        status: {
            type: String,
            enum: [
                "Draft",
                "Published",
                "In progress",
                "Submitted",
                "Under review",
                "Passed",
                "Revision requested",
                "Not passed",
            ],
            default: "Draft",
            index: true,
        },
        dueAt: { type: Date, required: true, index: true },
        publishedAt: { type: Date, default: null },
        startedAt: { type: Date, default: null },
        submittedAt: { type: Date, default: null },
        candidateInstructions: { type: String, default: "" },
        answers: { type: [answerSchema], default: [] },
        submissionNotes: { type: String, default: "" },
        score: { type: Number, default: null, min: 0 },
        maximumScore: { type: Number, required: true, min: 1 },
        feedback: { type: String, default: "" },
        questionReviews: { type: [questionReviewSchema], default: [] },
        reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewHistory: { type: [reviewHistorySchema], default: [] },
        resubmissionCount: { type: Number, default: 0, min: 0 },
        maxResubmissions: { type: Number, default: 1, min: 0, max: 10 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true },
);

candidateAssignmentSchema.index({ application: 1, status: 1, dueAt: 1 });

module.exports = mongoose.model("CandidateAssignment", candidateAssignmentSchema);
