const agentModel = require("../models/agent.model");

/** Generate the five-digit public Agent ID used across all agent creation flows. */
const generateUniqueAgentId = async () => {
    while (true) {
        const randomNumber = Math.floor(10000 + Math.random() * 90000).toString();
        const agentId = `#${randomNumber}`;
        const exists = await agentModel.exists({ agentId });

        if (!exists) return agentId;
    }
};

module.exports = generateUniqueAgentId;
