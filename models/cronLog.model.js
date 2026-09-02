const mongoose = require("mongoose");

const cronLogSchema = new mongoose.Schema(
    {
        cronName: {
            type: String,
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["success", "error"],
            required: true,
        },
        result: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        error: {
            type: String,
            default: null,
        },
        startedAt: {
            type: Date,
            required: true,
        },
        finishedAt: {
            type: Date,
            required: true,
        },
        durationMs: {
            type: Number,
            default: 0,
        },
        triggeredBy: {
            type: String,
            enum: ["schedule", "manual"],
            default: "schedule",
        },
    },
    {
        timestamps: false,
        versionKey: false,
        collection: "cron_logs",
    }
);

cronLogSchema.index({ cronName: 1, startedAt: -1 });
cronLogSchema.index({ startedAt: -1 });

const CronLog =
    mongoose.models.CronLog ||
    mongoose.model("CronLog", cronLogSchema);

module.exports = CronLog;
