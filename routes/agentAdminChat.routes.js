const express = require("express");
const router = express.Router();
const AgentAdminChatMessage = require("../models/agentAdminChatMessage.model");
const Agent = require("../models/agent.model");

// GET messages - returns conversation messages between specified agent and admin
// Supports /messages and /get
const getMessagesHandler = async (req, res) => {
  try {
    let { agentId, reader } = req.query;

    if (!agentId && req.user?.sub && req.user?.model === "Agent") {
      agentId = req.user.sub;
    }

    if (!agentId) {
      return res.status(400).json({ status: false, message: "agentId parameter is required." });
    }

    // Auto-mark opposite sender's messages as read if reader is provided
    const activeReader = reader || (req.user?.model === "Agent" ? "agent" : "admin");
    if (activeReader) {
      const oppositeSender = activeReader === "agent" ? "admin" : "agent";
      await AgentAdminChatMessage.updateMany(
        { agent: agentId, sender: oppositeSender, read: false },
        { $set: { read: true } }
      );
    }

    const messages = await AgentAdminChatMessage.find({ agent: agentId })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ status: true, data: messages });
  } catch (error) {
    console.error("Error fetching agent-admin messages:", error);
    return res.status(500).json({ status: false, message: "Server error fetching messages." });
  }
};

router.get("/messages", getMessagesHandler);
router.get("/get", getMessagesHandler);

// POST message - sends a new message in the agent-admin thread
// Supports /messages and /post
const postMessageHandler = async (req, res) => {
  try {
    let { agentId, message, sender, senderName } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ status: false, message: "Message content cannot be empty." });
    }

    if (!agentId && req.user?.sub && req.user?.model === "Agent") {
      agentId = req.user.sub;
    }

    if (!agentId) {
      return res.status(400).json({ status: false, message: "agentId is required." });
    }

    const agentDoc = await Agent.findById(agentId).lean();
    if (!agentDoc) {
      return res.status(404).json({ status: false, message: "Agent not found." });
    }

    if (!sender) {
      sender = req.user?.model === "Agent" ? "agent" : "admin";
    }

    if (!senderName) {
      if (sender === "agent") {
        senderName = `${agentDoc.firstName || ""} ${agentDoc.lastName || ""}`.trim() || agentDoc.fullName || "Agent";
      } else {
        senderName = "Admin Support";
      }
    }

    const newMessage = await AgentAdminChatMessage.create({
      agent: agentId,
      sender,
      senderName,
      message: message.trim(),
    });

    return res.status(201).json({ status: true, data: newMessage });
  } catch (error) {
    console.error("Error creating agent-admin message:", error);
    return res.status(500).json({ status: false, message: "Server error posting message." });
  }
};

router.post("/messages", postMessageHandler);
router.post("/post", postMessageHandler);

// GET unread count map or for single agent
router.get("/unread", async (req, res) => {
  try {
    const { agentId } = req.query;

    if (agentId) {
      const count = await AgentAdminChatMessage.countDocuments({
        agent: agentId,
        sender: "admin",
        read: false,
      });
      return res.json({ status: true, unreadCount: count });
    }

    // For admin: get unread messages count per agent
    const unreadCounts = await AgentAdminChatMessage.aggregate([
      {
        $match: {
          sender: "agent",
          read: false,
        },
      },
      {
        $group: {
          _id: "$agent",
          count: { $sum: 1 },
        },
      },
    ]);

    const countsMap = {};
    unreadCounts.forEach((u) => {
      countsMap[u._id.toString()] = u.count;
    });

    return res.json({ status: true, data: countsMap });
  } catch (error) {
    console.error("Error fetching agent-admin unread counts:", error);
    return res.status(500).json({ status: false, message: "Server error fetching unread counts." });
  }
});

// GET agents list with latest message summary for admin conversation list
router.get("/agents", async (req, res) => {
  try {
    const agents = await Agent.find({})
      .select("firstName lastName fullName email agentId agentLevel profileImage status kycStatus")
      .lean();

    // Get unread counts for admin (unread messages sent by agents)
    const unreadCounts = await AgentAdminChatMessage.aggregate([
      { $match: { sender: "agent", read: false } },
      { $group: { _id: "$agent", count: { $sum: 1 } } },
    ]);
    const unreadMap = {};
    unreadCounts.forEach((u) => {
      unreadMap[u._id.toString()] = u.count;
    });

    // Get latest message for each agent
    const latestMessages = await AgentAdminChatMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$agent",
          lastMessage: { $first: "$message" },
          lastSender: { $first: "$sender" },
          lastCreatedAt: { $first: "$createdAt" },
        },
      },
    ]);
    const latestMap = {};
    latestMessages.forEach((l) => {
      latestMap[l._id.toString()] = l;
    });

    const enrichedAgents = agents.map((agent) => {
      const idStr = agent._id.toString();
      const lastMsg = latestMap[idStr];
      return {
        ...agent,
        unreadCount: unreadMap[idStr] || 0,
        lastMessage: lastMsg ? lastMsg.lastMessage : "",
        lastSender: lastMsg ? lastMsg.lastSender : "",
        lastMessageAt: lastMsg ? lastMsg.lastCreatedAt : null,
      };
    });

    // Sort agents: those with latest messages first, then alphabetically
    enrichedAgents.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) {
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      }
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return (a.firstName || "").localeCompare(b.firstName || "");
    });

    return res.json({ status: true, data: enrichedAgents });
  } catch (error) {
    console.error("Error fetching agent list for admin chat:", error);
    return res.status(500).json({ status: false, message: "Server error fetching agent conversations list." });
  }
});

module.exports = router;
