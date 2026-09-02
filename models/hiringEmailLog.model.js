const mongoose = require("mongoose");

const hiringEmailLogSchema = new mongoose.Schema(
    {
        eventKey: { type: String, required: true, unique: true, index: true },
        type: {
            type: String,
            required: true,
            enum: [
                "candidate_tracking_otp",
                "application_received",
                "application_progress_updated",
                "interview_scheduled",
                "interview_rescheduled",
                "interview_cancelled",
                "assignment_assigned",
                "assignment_deadline_updated",
                "assignment_submission_received",
                "assignment_revision_requested",
                "assessment_result_available",
                "application_successful",
                "application_unsuccessful",
            ],
            index: true,
        },
        application: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "HiringApplication",
            required: true,
            index: true,
        },
        applicationReference: { type: String, required: true, index: true },
        recipient: { type: String, required: true, lowercase: true, trim: true },
        subject: { type: String, required: true },
        status: {
            type: String,
            enum: ["pending", "sent", "failed"],
            default: "pending",
            index: true,
        },
        provider: { type: String, default: "resend" },
        providerMessageId: { type: String, default: "" },
        attempts: { type: Number, default: 1, min: 1 },
        lastError: { type: String, default: "" },
        sentAt: { type: Date, default: null },
        context: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true },
);

hiringEmailLogSchema.index({ application: 1, createdAt: -1 });
hiringEmailLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("HiringEmailLog", hiringEmailLogSchema);
