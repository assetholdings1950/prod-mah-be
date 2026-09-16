const mongoose = require("mongoose");

const agentAdminChatMessageSchema = new mongoose.Schema(
  {
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      index: true,
    },
    sender: {
      type: String,
      enum: ["agent", "admin"],
      required: true,
    },
    senderName: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AgentAdminChatMessage", agentAdminChatMessageSchema);
