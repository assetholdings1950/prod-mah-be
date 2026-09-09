const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
    {
        providerAttachmentId: { type: String, default: "" },
        filename: { type: String, required: true },
        contentType: { type: String, default: "application/octet-stream" },
        size: { type: Number, default: 0 },
        disposition: { type: String, enum: ["attachment", "inline"], default: "attachment" },
    },
    { _id: false },
);

const deliveryEventSchema = new mongoose.Schema(
    {
        type: { type: String, required: true },
        at: { type: Date, default: Date.now },
        detail: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { _id: false },
);

const adminEmailMessageSchema = new mongoose.Schema(
    {
        thread: { type: mongoose.Schema.Types.ObjectId, ref: "AdminEmailThread", required: true, index: true },
        direction: { type: String, enum: ["outbound", "inbound"], required: true, index: true },
        from: { type: String, required: true, trim: true },
        to: [{ type: String, lowercase: true, trim: true }],
        cc: [{ type: String, lowercase: true, trim: true }],
        bcc: [{ type: String, lowercase: true, trim: true }],
        subject: { type: String, required: true, maxlength: 200 },
        bodyText: { type: String, default: "", maxlength: 100000 },
        bodyHtml: { type: String, default: "", maxlength: 250000 },
        attachments: { type: [attachmentSchema], default: [] },
        provider: { type: String, default: "resend" },
        providerEmailId: { type: String, default: "" },
        internetMessageId: { type: String, default: "" },
        inReplyTo: { type: String, default: "" },
        status: {
            type: String,
            enum: ["pending", "sent", "delivered", "delivery_delayed", "opened", "clicked", "received", "bounced", "complained", "suppressed", "failed"],
            default: "pending",
            index: true,
        },
        lastError: { type: String, default: "", maxlength: 2000 },
        deliveryEvents: { type: [deliveryEventSchema], default: [] },
        createdBy: {
            id: { type: mongoose.Schema.Types.ObjectId, default: null },
            email: { type: String, default: "" },
        },
        sentAt: { type: Date, default: null },
        receivedAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: false, collection: "admin_email_messages" },
);

adminEmailMessageSchema.index({ thread: 1, createdAt: 1 });
adminEmailMessageSchema.index(
    { providerEmailId: 1 },
    { unique: true, partialFilterExpression: { providerEmailId: { $type: "string", $gt: "" } } },
);

module.exports =
    mongoose.models.AdminEmailMessage ||
    mongoose.model("AdminEmailMessage", adminEmailMessageSchema);
