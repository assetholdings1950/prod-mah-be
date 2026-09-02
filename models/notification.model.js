const mongoose = require("mongoose");

const readReceiptSchema = new mongoose.Schema({
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    readAt: { type: Date, default: Date.now },
}, { _id: false });

const footprintSchema = new mongoose.Schema({
    label: { type: String, required: true },
    description: { type: String, default: null },
    at: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const notificationSchema = new mongoose.Schema({
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "actorModel",
        default: null,
        index: true,
    },
    actorModel: {
        type: String,
        enum: ["Client", "Agent", "System"],
        required: true,
        index: true,
    },
    action: { type: String, required: true, index: true },
    category: {
        type: String,
        enum: ["auth", "profile", "kyc", "finance", "portfolio", "account", "system"],
        default: "system",
        index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    priority: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        default: "low",
        index: true,
    },
    actionRequired: { type: Boolean, default: false, index: true },
    entity: {
        model: { type: String, default: null },
        id: { type: mongoose.Schema.Types.ObjectId, default: null },
        reference: { type: String, default: null },
        label: { type: String, default: null },
        url: { type: String, default: null },
        state: { type: String, default: null },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    footprints: { type: [footprintSchema], default: [] },
    source: {
        method: { type: String, default: null },
        path: { type: String, default: null },
        ip: { type: String, default: null },
        userAgent: { type: String, default: null },
    },
    performedBy: {
        id: { type: mongoose.Schema.Types.ObjectId, default: null },
        role: { type: String, default: null },
        name: { type: String, default: null },
    },
    readReceipts: { type: [readReceiptSchema], default: [] },
}, {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: "admin_notifications",
});

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ actorModel: 1, createdAt: -1 });
notificationSchema.index({ category: 1, priority: 1, createdAt: -1 });
notificationSchema.index({ actionRequired: 1, createdAt: -1 });
notificationSchema.index({ "readReceipts.admin": 1, createdAt: -1 });
notificationSchema.index({ title: "text", message: "text", action: "text", "entity.reference": "text" });

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
