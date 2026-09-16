const express = require("express");
const router = express.Router();
const ClientChatMessage = require("../models/clientChatMessage.model");
const Client = require("../models/client.model");
const Agent = require("../models/agent.model");
const authenticate = require("../middleware/auth.midleware");

const mongoose = require("mongoose");

// Fetch chat messages between client and account manager
router.get("/messages", async (req, res) => {
    try {
        let { clientId, agentId, reader } = req.query;

        if (!clientId && req.user?.sub && req.user?.model === "Client") {
            clientId = req.user.sub;
        }

        if (!clientId) {
            return res.status(400).json({ status: false, message: "clientId parameter is required." });
        }

        const clientDoc = await Client.findById(clientId).select("accountManager firstName lastName email").lean();
        if (!clientDoc) {
            return res.status(404).json({ status: false, message: "Client not found." });
        }

        if (!agentId) {
            if (clientDoc.accountManager) {
                agentId = clientDoc.accountManager.toString();
            } else if (req.user?.sub && req.user?.model === "Agent") {
                agentId = req.user.sub;
            }
        }

        if (!agentId) {
            return res.json({ status: true, data: [] });
        }

        // Auto-mark opposite sender's messages as read if reader is provided (skip if reader is admin)
        const activeReader = reader || (req.user?.model === "Agent" ? "agent" : req.user?.model === "Client" ? "client" : null);
        if (activeReader && activeReader !== "admin") {
            const oppositeSender = activeReader === "agent" ? "client" : "agent";
            await ClientChatMessage.updateMany(
                { client: clientId, agent: agentId, sender: oppositeSender, read: false },
                { $set: { read: true } }
            );
        }

        const messages = await ClientChatMessage.find({
            client: clientId,
            agent: agentId,
        })
            .sort({ createdAt: 1 })
            .lean();

        return res.json({ status: true, data: messages });
    } catch (error) {
        console.error("Error fetching chat messages:", error);
        return res.status(500).json({ status: false, message: "Server error fetching messages." });
    }
});

// Post a new message
router.post("/messages", async (req, res) => {
    try {
        let { clientId, agentId, message, sender, senderName } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ status: false, message: "Message content cannot be empty." });
        }

        // Infer sender if not provided
        if (!sender) {
            if (req.user?.model === "Agent") {
                sender = "agent";
            } else {
                sender = "client";
            }
        }

        if (!clientId && req.user?.sub && req.user?.model === "Client") {
            clientId = req.user.sub;
        }

        if (!clientId) {
            return res.status(400).json({ status: false, message: "clientId is required." });
        }

        const clientDoc = await Client.findById(clientId).lean();
        if (!clientDoc) {
            return res.status(404).json({ status: false, message: "Client not found." });
        }

        if (!agentId) {
            if (clientDoc.accountManager) {
                agentId = clientDoc.accountManager.toString();
            } else if (req.user?.sub && req.user?.model === "Agent") {
                agentId = req.user.sub;
            }
        }

        if (!agentId) {
            return res.status(400).json({ status: false, message: "No account manager assigned to this client." });
        }

        if (!senderName) {
            if (sender === "client") {
                senderName = `${clientDoc.firstName || ""} ${clientDoc.lastName || ""}`.trim() || clientDoc.email;
            } else {
                const agentDoc = await Agent.findById(agentId).lean();
                senderName = agentDoc ? `${agentDoc.firstName || ""} ${agentDoc.lastName || ""}`.trim() || agentDoc.fullName || "Account Manager" : "Account Manager";
            }
        }

        const newMessage = await ClientChatMessage.create({
            client: clientId,
            agent: agentId,
            sender,
            senderName,
            message: message.trim(),
        });

        return res.status(201).json({ status: true, data: newMessage });
    } catch (error) {
        console.error("Error creating chat message:", error);
        return res.status(500).json({ status: false, message: "Server error posting message." });
    }
});

// Fetch unread message counts
router.get("/unread", async (req, res) => {
    try {
        let { agentId, clientId } = req.query;

        if (agentId) {
            const unreadCounts = await ClientChatMessage.aggregate([
                {
                    $match: {
                        agent: new mongoose.Types.ObjectId(agentId),
                        sender: "client",
                        read: false
                    }
                },
                {
                    $group: {
                        _id: "$client",
                        count: { $sum: 1 }
                    }
                }
            ]);
            const countsMap = {};
            unreadCounts.forEach(u => {
                countsMap[u._id.toString()] = u.count;
            });
            return res.json({ status: true, data: countsMap });
        } else if (clientId) {
            const count = await ClientChatMessage.countDocuments({
                client: clientId,
                sender: "agent",
                read: false
            });
            return res.json({ status: true, unreadCount: count });
        }

        return res.status(400).json({ status: false, message: "agentId or clientId required." });
    } catch (error) {
        console.error("Error fetching unread counts:", error);
        return res.status(500).json({ status: false, message: "Server error fetching unread counts." });
    }
});

// GET all client-agent conversation threads for Admin read-only monitoring
const getThreadsHandler = async (req, res) => {
    try {
        const messageAgg = await ClientChatMessage.aggregate([
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: { client: "$client", agent: "$agent" },
                    lastMessage: { $first: "$message" },
                    lastSender: { $first: "$sender" },
                    lastMessageAt: { $first: "$createdAt" },
                    totalMessages: { $sum: 1 },
                    unreadForAgent: {
                        $sum: {
                            $cond: [{ $and: [{ $eq: ["$sender", "client"] }, { $eq: ["$read", false] }] }, 1, 0]
                        }
                    },
                    unreadForClient: {
                        $sum: {
                            $cond: [{ $and: [{ $eq: ["$sender", "agent"] }, { $eq: ["$read", false] }] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        const aggMap = {};
        messageAgg.forEach((item) => {
            if (item._id && item._id.client && item._id.agent) {
                const key = `${item._id.client.toString()}_${item._id.agent.toString()}`;
                aggMap[key] = item;
            }
        });

        const clients = await Client.find({})
            .select("firstName lastName email clientId profileImage accountManager status")
            .populate("accountManager", "firstName lastName fullName email agentId agentLevel profileImage status")
            .lean();

        const agents = await Agent.find({})
            .select("firstName lastName fullName email agentId agentLevel profileImage status")
            .lean();
        const agentMap = {};
        agents.forEach((a) => {
            agentMap[a._id.toString()] = a;
        });

        const threadsList = [];
        const processedKeys = new Set();

        clients.forEach((client) => {
            const agent = client.accountManager;
            if (agent && agent._id) {
                const key = `${client._id.toString()}_${agent._id.toString()}`;
                processedKeys.add(key);
                const agg = aggMap[key];

                threadsList.push({
                    threadId: key,
                    client: {
                        _id: client._id,
                        firstName: client.firstName || "",
                        lastName: client.lastName || "",
                        email: client.email || "",
                        clientId: client.clientId || "",
                        profileImage: client.profileImage || "",
                    },
                    agent: {
                        _id: agent._id,
                        firstName: agent.firstName || "",
                        lastName: agent.lastName || "",
                        fullName: agent.fullName || "",
                        email: agent.email || "",
                        agentId: agent.agentId || "",
                        agentLevel: agent.agentLevel || "",
                        profileImage: agent.profileImage || "",
                    },
                    lastMessage: agg ? agg.lastMessage : "",
                    lastSender: agg ? agg.lastSender : "",
                    lastMessageAt: agg ? agg.lastMessageAt : null,
                    totalMessages: agg ? agg.totalMessages : 0,
                    unreadForAgent: agg ? agg.unreadForAgent : 0,
                    unreadForClient: agg ? agg.unreadForClient : 0,
                });
            }
        });

        for (const item of messageAgg) {
            if (item._id && item._id.client && item._id.agent) {
                const key = `${item._id.client.toString()}_${item._id.agent.toString()}`;
                if (!processedKeys.has(key)) {
                    processedKeys.add(key);
                    const clientDoc = clients.find((c) => c._id.toString() === item._id.client.toString());
                    const agentDoc = agentMap[item._id.agent.toString()];

                    if (clientDoc || agentDoc) {
                        threadsList.push({
                            threadId: key,
                            client: clientDoc
                                ? {
                                    _id: clientDoc._id,
                                    firstName: clientDoc.firstName || "",
                                    lastName: clientDoc.lastName || "",
                                    email: clientDoc.email || "",
                                    clientId: clientDoc.clientId || "",
                                    profileImage: clientDoc.profileImage || "",
                                }
                                : { _id: item._id.client, firstName: "Client", lastName: "" },
                            agent: agentDoc
                                ? {
                                    _id: agentDoc._id,
                                    firstName: agentDoc.firstName || "",
                                    lastName: agentDoc.lastName || "",
                                    fullName: agentDoc.fullName || "",
                                    email: agentDoc.email || "",
                                    agentId: agentDoc.agentId || "",
                                    agentLevel: agentDoc.agentLevel || "",
                                    profileImage: agentDoc.profileImage || "",
                                }
                                : { _id: item._id.agent, firstName: "Agent", lastName: "" },
                            lastMessage: item.lastMessage || "",
                            lastSender: item.lastSender || "",
                            lastMessageAt: item.lastMessageAt || null,
                            totalMessages: item.totalMessages || 0,
                            unreadForAgent: item.unreadForAgent || 0,
                            unreadForClient: item.unreadForClient || 0,
                        });
                    }
                }
            }
        }

        threadsList.sort((a, b) => {
            if (a.lastMessageAt && b.lastMessageAt) {
                return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
            }
            if (a.lastMessageAt) return -1;
            if (b.lastMessageAt) return 1;
            const nameA = `${a.client?.firstName || ""} ${a.client?.lastName || ""}`.trim();
            const nameB = `${b.client?.firstName || ""} ${b.client?.lastName || ""}`.trim();
            return nameA.localeCompare(nameB);
        });

        return res.json({ status: true, data: threadsList });
    } catch (error) {
        console.error("Error fetching client-agent conversation threads:", error);
        return res.status(500).json({ status: false, message: "Server error fetching conversation threads." });
    }
};

router.get("/threads", getThreadsHandler);
router.get("/admin/threads", getThreadsHandler);

module.exports = router;
