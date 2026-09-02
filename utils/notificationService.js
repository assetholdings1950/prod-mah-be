const Notification = require("../models/notification.model");

const ACTION_LABELS = {
    submitted: "submitted",
    created: "created",
    requested: "requested",
    updated: "updated",
    approved: "approved",
    rejected: "rejected",
    deleted: "deleted",
    failed: "failed",
};

function humanize(value = "activity") {
    return String(value).replace(/[._/-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferPresentation(action, category, description) {
    const lower = String(action).toLowerCase();
    const verb = Object.keys(ACTION_LABELS).find((candidate) => lower.includes(candidate));
    const isFailure = /(failed|rejected|blocked|suspended|deleted)/.test(lower);
    const actionRequired = /(submitted|requested|pending|under_review|verification)/.test(lower);
    return {
        title: humanize(action),
        message: description || `${humanize(category)} activity ${verb ? ACTION_LABELS[verb] : "recorded"}.`,
        priority: isFailure ? "high" : actionRequired ? "medium" : "low",
        actionRequired,
    };
}

async function createAdminNotification(params) {
    const presentation = inferPresentation(params.action, params.category, params.message || params.description);
    const footprints = Array.isArray(params.footprints) && params.footprints.length
        ? params.footprints
        : [{ label: "Activity recorded", description: params.description || params.message || null, at: new Date() }];

    try {
        return await Notification.create({
            actorId: params.actorId || null,
            actorModel: params.actorModel || "System",
            action: params.action,
            category: params.category || "system",
            title: params.title || presentation.title,
            message: params.message || params.description || presentation.message,
            priority: params.priority || presentation.priority,
            actionRequired: params.actionRequired ?? presentation.actionRequired,
            entity: params.entity || {},
            metadata: params.metadata || null,
            footprints,
            source: params.source || {},
            performedBy: params.performedBy || {},
        });
    } catch (error) {
        console.error("[notification] Failed to persist notification:", error.message);
        return null;
    }
}

module.exports = { createAdminNotification, humanize };
