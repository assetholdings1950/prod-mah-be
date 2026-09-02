const mongoose = require("mongoose");

// One document represents one scheduled master slot on one UTC calendar day.
// The string _id is the idempotency key, so MongoDB's primary-key constraint
// protects against duplicate Vercel invocations across serverless instances.
const cronExecutionSchema = new mongoose.Schema(
    {
        _id: {
            type: String,
            required: true,
        },
        cronName: {
            type: String,
            required: true,
            index: true,
        },
        slot: {
            type: String,
            enum: ["morning", "evening"],
            required: true,
        },
        utcDate: {
            type: String,
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["running", "completed"],
            default: "running",
        },
        outcome: {
            type: String,
            enum: ["pending", "success", "error"],
            default: "pending",
        },
        startedAt: {
            type: Date,
            required: true,
        },
        finishedAt: {
            type: Date,
            default: null,
        },
        result: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        error: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: false,
        versionKey: false,
        collection: "cron_executions",
    }
);

const CronExecution =
    mongoose.models.CronExecution ||
    mongoose.model("CronExecution", cronExecutionSchema);

module.exports = CronExecution;
