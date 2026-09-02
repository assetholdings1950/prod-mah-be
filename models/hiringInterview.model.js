const mongoose = require("mongoose");

const preparationSchema = new mongoose.Schema(
    {
        resumeReviewed: { type: Boolean, default: false },
        introductionVideoReviewed: { type: Boolean, default: false },
        questionsPrepared: { type: Boolean, default: false },
        panelConfirmed: { type: Boolean, default: false },
    },
    { _id: false },
);

const hiringInterviewSchema = new mongoose.Schema(
    {
        application: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "HiringApplication",
            required: true,
            index: true,
        },
        applicationReference: { type: String, required: true },
        candidateName: { type: String, required: true },
        role: { type: String, required: true },
        startAt: { type: Date, required: true, index: true },
        endAt: { type: Date, required: true },
        type: {
            type: String,
            enum: [
                "Initial Interview",
                "Portfolio Interview",
                "Technical Interview",
                "Role Interview",
                "Standards Interview",
                "Final Interview",
                "HR Interview",
            ],
            required: true,
        },
        mode: { type: String, enum: ["Video call", "In person"], required: true },
        locationOrLink: { type: String, default: "" },
        interviewers: { type: [String], default: ["Hiring Admin"] },
        status: {
            type: String,
            enum: ["Scheduled", "Completed", "Cancelled", "No show"],
            default: "Scheduled",
            index: true,
        },
        preparation: { type: preparationSchema, default: () => ({}) },
        notes: { type: String, default: "", maxlength: 10000 },
        outcome: { type: String, default: "", maxlength: 10000 },
        recommendation: {
            type: String,
            enum: ["", "Strong recommendation", "Consider", "Hold", "Reject"],
            default: "",
        },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true },
);

hiringInterviewSchema.pre("validate", function validateTimes(next) {
    if (this.startAt && this.endAt && this.endAt <= this.startAt) {
        return next(new Error("Interview end time must be after its start time"));
    }
    next();
});

hiringInterviewSchema.index({ startAt: 1, status: 1 });
hiringInterviewSchema.index({ applicationReference: 1, startAt: -1 });
hiringInterviewSchema.index({ status: 1, startAt: 1, endAt: 1 });

module.exports = mongoose.model("HiringInterview", hiringInterviewSchema);
