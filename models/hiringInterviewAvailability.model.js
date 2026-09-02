const mongoose = require("mongoose");

const hiringInterviewAvailabilitySchema = new mongoose.Schema(
    {
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
        status: {
            type: String,
            enum: ["Available", "Unavailable"],
            required: true,
            index: true,
        },
        label: { type: String, trim: true, maxlength: 120, default: "" },
        timezone: { type: String, trim: true, default: "Asia/Singapore" },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true },
);

hiringInterviewAvailabilitySchema.pre("validate", function validateTimes(next) {
    if (this.startAt && this.endAt && this.endAt <= this.startAt) {
        return next(new Error("Availability end time must be after its start time"));
    }
    next();
});

// Range reads are the hot path for the weekly calendar.
hiringInterviewAvailabilitySchema.index({ startAt: 1, endAt: 1 });

module.exports = mongoose.model(
    "HiringInterviewAvailability",
    hiringInterviewAvailabilitySchema,
);
