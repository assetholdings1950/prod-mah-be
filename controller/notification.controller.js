const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Notification = require("../models/notification.model");
const Client = require("../models/client.model");
const Agent = require("../models/agent.model");

function unreadFilter(adminId) {
    return { "readReceipts.admin": { $ne: new mongoose.Types.ObjectId(adminId) } };
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getSummary(adminId) {
    const unread = unreadFilter(adminId);
    const [unreadCount, actionRequired, clientActivity, agentActivity, systemActivity] = await Promise.all([
        Notification.countDocuments(unread),
        Notification.countDocuments({ ...unread, actionRequired: true }),
        Notification.countDocuments({ actorModel: "Client" }),
        Notification.countDocuments({ actorModel: "Agent" }),
        Notification.countDocuments({ actorModel: "System" }),
    ]);
    return { unread: unreadCount, actionRequired, clientActivity, agentActivity, systemActivity };
}

async function resolveActorIds(search, actorModel) {
    const matcher = new RegExp(escapeRegex(search), "i");
    const condition = { $or: [{ firstName: matcher }, { lastName: matcher }, { fullName: matcher }, { email: matcher }] };
    const [clients, agents] = await Promise.all([
        actorModel !== "Agent" ? Client.find({ ...condition, $or: [...condition.$or, { clientId: matcher }] }).select("_id").limit(100).lean() : [],
        actorModel !== "Client" ? Agent.find({ ...condition, $or: [...condition.$or, { agentId: matcher }] }).select("_id").limit(100).lean() : [],
    ]);
    return [...clients.map((item) => item._id), ...agents.map((item) => item._id)];
}

async function enrichNotifications(notifications, adminId) {
    const clientIds = notifications.filter((item) => item.actorModel === "Client" && item.actorId).map((item) => item.actorId);
    const agentIds = notifications.filter((item) => item.actorModel === "Agent" && item.actorId).map((item) => item.actorId);
    const [clients, agents] = await Promise.all([
        Client.find({ _id: { $in: clientIds } }).select("firstName lastName fullName email clientId profileImage").lean(),
        Agent.find({ _id: { $in: agentIds } }).select("firstName lastName fullName email agentId profileImage").lean(),
    ]);
    const actors = new Map([...clients, ...agents].map((actor) => [String(actor._id), actor]));
    return notifications.map((item) => ({
        ...item,
        actor: item.actorId ? actors.get(String(item.actorId)) || null : null,
        isRead: item.readReceipts.some((receipt) => String(receipt.admin) === String(adminId)),
        readReceipts: undefined,
    }));
}

const listNotifications = asyncHandler(async (req, res) => {
    const adminId = req.user.sub;
    const summary = await getSummary(adminId);
    if (req.query.summaryOnly === "true") return res.json({ status: true, summary });

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const filter = {};

    if (["Client", "Agent", "System"].includes(req.query.actorModel)) filter.actorModel = req.query.actorModel;
    if (["auth", "profile", "kyc", "finance", "portfolio", "account", "system"].includes(req.query.category)) filter.category = req.query.category;
    if (["low", "medium", "high", "critical"].includes(req.query.priority)) filter.priority = req.query.priority;
    if (req.query.actionRequired === "true") filter.actionRequired = true;
    if (req.query.actionRequired === "false") filter.actionRequired = false;
    if (req.query.readState === "unread") Object.assign(filter, unreadFilter(adminId));
    if (req.query.readState === "read") filter["readReceipts.admin"] = new mongoose.Types.ObjectId(adminId);

    if (req.query.startDate || req.query.endDate) {
        filter.createdAt = {};
        if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
        if (req.query.endDate) {
            const end = new Date(req.query.endDate);
            end.setHours(23, 59, 59, 999);
            filter.createdAt.$lte = end;
        }
    }

    const search = req.query.search?.trim();
    if (search) {
        const actorIds = await resolveActorIds(search, filter.actorModel);
        const matcher = new RegExp(escapeRegex(search), "i");
        filter.$or = [
            { actorId: { $in: actorIds } },
            { title: matcher },
            { message: matcher },
            { action: matcher },
            { "entity.reference": matcher },
        ];
    }

    const [items, total] = await Promise.all([
        Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Notification.countDocuments(filter),
    ]);

    return res.json({
        status: true,
        notifications: await enrichNotifications(items, adminId),
        summary,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    });
});

const getNotification = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ status: false, message: "Invalid notification id." });
    const item = await Notification.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ status: false, message: "Notification not found." });
    const [notification] = await enrichNotifications([item], req.user.sub);
    return res.json({ status: true, notification });
});

const updateReadState = asyncHandler(async (req, res) => {
    const adminId = new mongoose.Types.ObjectId(req.user.sub);
    const markRead = req.body.read !== false;
    const all = req.body.all === true;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(mongoose.Types.ObjectId.isValid) : [];
    if (!all && ids.length === 0) return res.status(400).json({ status: false, message: "Provide notification ids or set all to true." });

    const filter = all ? {} : { _id: { $in: ids } };
    let result;
    if (markRead) {
        result = await Notification.updateMany(
            { ...filter, "readReceipts.admin": { $ne: adminId } },
            { $push: { readReceipts: { admin: adminId, readAt: new Date() } } }
        );
    } else {
        result = await Notification.updateMany(filter, { $pull: { readReceipts: { admin: adminId } } });
    }

    const summary = await getSummary(adminId);
    return res.json({ status: true, modified: result.modifiedCount, summary });
});

module.exports = { listNotifications, getNotification, updateReadState };
