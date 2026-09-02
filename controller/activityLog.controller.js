const asyncHandler = require("express-async-handler");
const ActivityLog  = require("../models/activityLog.model");
const clientModel  = require("../models/client.model");
const agentModel   = require("../models/agent.model");
const mongoose     = require("mongoose");

const getActivityLogsController = asyncHandler(async (req, res) => {
    const page      = Math.max(1, parseInt(req.query.page)  || 1);
    const limit     = Math.min(50, parseInt(req.query.limit) || 20);
    const userId    = req.query.userId    || null;
    const userModel = req.query.userModel || null;
    const category  = req.query.category  || null;
    const action    = req.query.action    || null;
    const search    = req.query.search?.trim() || null;

    const filter = {};

    // Agent security check: Agent can only request logs of their own referred clients or themselves
    if (req.user && req.user.model === "Agent") {
        if (userId) {
            if (userModel === "Client") {
                const client = await clientModel.findById(userId).select("agent").lean();
                if (!client || String(client.agent) !== String(req.user.sub)) {
                    return res.status(403).json({ status: false, message: "Forbidden - Client is not registered under your referral network." });
                }
            } else if (userModel === "Agent") {
                if (String(userId) !== String(req.user.sub)) {
                    return res.status(403).json({ status: false, message: "Forbidden - Cannot access another agent's logs." });
                }
            } else {
                return res.status(400).json({ status: false, message: "Invalid userModel." });
            }
            filter.userId = new mongoose.Types.ObjectId(userId);
            if (userModel) filter.userModel = userModel;
        } else {
            const referredClients = await clientModel.find({ agent: req.user.sub }).select("_id").lean();
            const referredClientIds = referredClients.map((c) => c._id);
            if (userModel === "Client") {
                filter.userId = { $in: referredClientIds };
                filter.userModel = "Client";
            } else if (userModel === "Agent") {
                filter.userId = new mongoose.Types.ObjectId(req.user.sub);
                filter.userModel = "Agent";
            } else {
                filter.$or = [
                    { userId: new mongoose.Types.ObjectId(req.user.sub), userModel: "Agent" },
                    { userId: { $in: referredClientIds }, userModel: "Client" }
                ];
            }
        }
    } else {
        if (userId && mongoose.Types.ObjectId.isValid(userId)) filter.userId = new mongoose.Types.ObjectId(userId);
        if (userModel && ["Client", "Agent", "System"].includes(userModel)) filter.userModel = userModel;
    }
    if (category)  filter.category = category;
    if (action)    filter.action   = action;

    // search by user name — resolve ids first then filter
    if (search && !userId) {
        const nameRegex = new RegExp(search, "i");
        const [clients, agents] = await Promise.all([
            userModel !== "Agent" ? clientModel.find({ $or: [{ firstName: nameRegex }, { lastName: nameRegex }, { email: nameRegex }, { clientId: nameRegex }] }).select("_id").lean() : [],
            userModel !== "Client" ? agentModel.find({ $or: [{ firstName: nameRegex }, { lastName: nameRegex }, { email: nameRegex }, { agentId: nameRegex }] }).select("_id").lean() : [],
        ]);
        const ids = [...clients.map((c) => c._id), ...agents.map((a) => a._id)];
        if (ids.length === 0) {
            return res.status(200).json({ status: true, logs: [], totalDocs: 0, totalPages: 0, page, limit });
        }
        filter.userId = { $in: ids };
    }

    const [logs, total] = await Promise.all([
        ActivityLog.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        ActivityLog.countDocuments(filter),
    ]);

    const enriched = await Promise.all(
        logs.map(async (log) => {
            try {
                if (log.userModel === "System") return { ...log, user: null };
                const Model = log.userModel === "Agent" ? agentModel : clientModel;
                const user  = await Model.findById(log.userId).select("firstName lastName email clientId agentId profileImage").lean();
                return { ...log, user };
            } catch {
                return log;
            }
        })
    );

    return res.status(200).json({
        status: true,
        logs: enriched,
        total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
    });
});

module.exports = { getActivityLogsController };
