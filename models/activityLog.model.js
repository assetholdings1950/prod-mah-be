const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            refPath: "userModel",
            index: true,
        },
        userModel: {
            type: String,
            required: true,
            enum: ["Client", "Agent", "System"],
        },
        action: {
            type: String,
            required: true,
        },
        category: {
            type: String,
            required: true,
            enum: ["auth", "profile", "kyc", "finance", "portfolio", "account", "system"],
        },
        description: {
            type: String,
            required: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        performedBy: {
            id:   { type: mongoose.Schema.Types.ObjectId, default: null },
            role: { type: String, default: null },
            name: { type: String, default: null },
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
        collection: "activity_logs",
    }
);

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ userModel: 1, createdAt: -1 });
activityLogSchema.index({ "performedBy.id": 1, createdAt: -1 });
activityLogSchema.index({ category: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

const ActivityLog =
    mongoose.models.ActivityLog ||
    mongoose.model("ActivityLog", activityLogSchema);

module.exports = ActivityLog;
