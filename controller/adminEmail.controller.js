const {
    createThreadAndSend,
    replyToThread,
    listThreads,
    getThread,
    setThreadStatus,
    resolveAttachment,
    handleResendWebhook,
} = require("../services/adminEmail.service");
const { logActivity } = require("../utils/activityLogger");

const errorResponse = (res, error, fallback = "Email operation failed") => {
    const message = String(error?.message || fallback);
    const validationError = /required|invalid|unsupported|at most|20 MB|prefix|status must/i.test(message);
    return res.status(error?.statusCode || (validationError ? 400 : 500)).json({
        status: false,
        message,
    });
};

const actor = (req) => ({
    id: req.user?.sub || null,
    role: Array.isArray(req.user?.role)
        ? req.user.role.map((item) => typeof item === "string" ? item : item?.roleName).filter(Boolean).join(", ")
        : String(req.user?.role || "Admin"),
    name: req.user?.email || "Admin",
});

const sendEmailController = async (req, res) => {
    try {
        const result = await createThreadAndSend({ rawPayload: req.body, requestFiles: req.files, user: req.user });
        await logActivity({
            userId: null,
            userModel: "System",
            action: "email.sent",
            category: "system",
            description: `Admin email sent to ${result.message.to.join(", ")}`,
            metadata: { threadId: result.thread._id, messageId: result.message._id, subject: result.message.subject },
            performedBy: actor(req),
            notification: { title: "Admin email sent", priority: "low", actionRequired: false },
        });
        return res.status(201).json({ status: true, message: "Email sent successfully", data: { thread: result.thread, email: result.message } });
    } catch (error) {
        return errorResponse(res, error, "Could not send email");
    }
};

const replyEmailController = async (req, res) => {
    try {
        const result = await replyToThread({ threadId: req.params.id, rawPayload: req.body, requestFiles: req.files, user: req.user });
        await logActivity({
            userId: null,
            userModel: "System",
            action: "email.replied",
            category: "system",
            description: `Admin replied to ${result.message.to.join(", ")}`,
            metadata: { threadId: result.thread._id, messageId: result.message._id, subject: result.message.subject },
            performedBy: actor(req),
            notification: { title: "Email reply sent", priority: "low", actionRequired: false },
        });
        return res.status(201).json({ status: true, message: "Reply sent successfully", data: { thread: result.thread, email: result.message } });
    } catch (error) {
        return errorResponse(res, error, "Could not send reply");
    }
};

const listEmailThreadsController = async (req, res) => {
    try {
        const data = await listThreads(req.query);
        return res.status(200).json({ status: true, ...data });
    } catch (error) {
        return errorResponse(res, error, "Could not load email conversations");
    }
};

const getEmailThreadController = async (req, res) => {
    try {
        const data = await getThread(req.params.id);
        if (!data) return res.status(404).json({ status: false, message: "Conversation not found" });
        return res.status(200).json({ status: true, data });
    } catch (error) {
        return errorResponse(res, error, "Could not load conversation");
    }
};

const updateEmailThreadController = async (req, res) => {
    try {
        const thread = await setThreadStatus(req.params.id, String(req.body?.status || ""));
        if (!thread) return res.status(404).json({ status: false, message: "Conversation not found" });
        return res.status(200).json({ status: true, message: `Conversation marked ${thread.status}`, data: thread });
    } catch (error) {
        return errorResponse(res, error, "Could not update conversation");
    }
};

const getEmailAttachmentController = async (req, res) => {
    try {
        const attachment = await resolveAttachment({ messageId: req.params.messageId, attachmentId: req.params.attachmentId });
        if (!attachment) return res.status(404).json({ status: false, message: "Attachment not found" });
        return res.status(200).json({ status: true, data: attachment });
    } catch (error) {
        return errorResponse(res, error, "Could not retrieve attachment");
    }
};

const resendWebhookController = async (req, res) => {
    try {
        const rawBody = req.rawBody || JSON.stringify(req.body || {});
        const type = await handleResendWebhook({ rawBody, headers: req.headers });
        return res.status(200).json({ received: true, type });
    } catch (error) {
        const missingConfiguration = /not configured/i.test(String(error?.message || ""));
        return res.status(missingConfiguration ? 503 : 400).json({ received: false, message: missingConfiguration ? error.message : "Invalid webhook" });
    }
};

module.exports = {
    sendEmailController,
    replyEmailController,
    listEmailThreadsController,
    getEmailThreadController,
    updateEmailThreadController,
    getEmailAttachmentController,
    resendWebhookController,
};
