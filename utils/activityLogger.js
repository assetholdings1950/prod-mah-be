const ActivityLog = require("../models/activityLog.model");
const { createAdminNotification } = require("./notificationService");
const { getRequestContext } = require("./requestContext");

/**
 * Fire-and-forget activity logger. Never throws — safe to call anywhere.
 * @param {Object} params
 * @param {string|ObjectId|null} params.userId
 * @param {"Client"|"Agent"|"System"} params.userModel
 * @param {string} params.action        e.g. "deposit.approved"
 * @param {"auth"|"profile"|"kyc"|"finance"|"portfolio"|"account"|"system"} params.category
 * @param {string} params.description   Human-readable sentence
 * @param {Object} [params.metadata]    Extra context (amounts, currencies, etc.)
 * @param {Object} [params.performedBy] { id, role, name }
 */
async function logActivity({ userId, userModel, action, category, description, metadata = null, performedBy = {}, notification = {} }) {
    const context = getRequestContext();
    if (context) context.activityCaptured = true;
    try {
        await ActivityLog.create({ userId, userModel, action, category, description, metadata, performedBy });
    } catch {
        // silent — logging must never break the main flow
    }

    await createAdminNotification({
        actorId: userId,
        actorModel: userModel,
        action,
        category,
        description,
        metadata,
        performedBy,
        source: context?.req ? {
            method: context.req.method,
            path: String(context.req.originalUrl || context.req.url || "").split("?")[0],
            ip: context.req.ip || context.req.socket?.remoteAddress || null,
            userAgent: context.req.get("user-agent") || null,
        } : {},
        ...notification,
    });
}

module.exports = { logActivity };
