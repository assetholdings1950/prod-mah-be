const mongoose = require("mongoose");

const adminEmailThreadSchema = new mongoose.Schema(
    {
        subject: { type: String, required: true, trim: true, maxlength: 200 },
        participants: [{ type: String, lowercase: true, trim: true }],
        replyToken: { type: String, required: true, unique: true },
        status: { type: String, enum: ["open", "closed"], default: "open", index: true },
        lastDirection: { type: String, enum: ["outbound", "inbound"], default: "outbound" },
        lastSnippet: { type: String, default: "", maxlength: 240 },
        lastMessageAt: { type: Date, default: Date.now, index: true },
        messageCount: { type: Number, default: 0, min: 0 },
        lastSenderPrefix: { type: String, default: "onboarding" },
        createdBy: {
            id: { type: mongoose.Schema.Types.ObjectId, default: null },
            email: { type: String, default: "" },
        },
    },
    { timestamps: true, versionKey: false, collection: "admin_email_threads" },
);

adminEmailThreadSchema.index({ participants: 1, lastMessageAt: -1 });
adminEmailThreadSchema.index({ subject: "text", participants: "text" });

module.exports =
    mongoose.models.AdminEmailThread ||
    mongoose.model("AdminEmailThread", adminEmailThreadSchema);
