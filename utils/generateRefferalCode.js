const clientModel = require("../models/client.model");
const agentModel = require("../models/agent.model");

const generateReferralCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "MAH";

    for (let i = 0; i < 6; i++) {
        code += chars.charAt(
            Math.floor(Math.random() * chars.length)
        );
    }

    return code;
};


const generateUniqueReferralCode = async () => {

    let referralCode;
    let exists = true;

    while (exists) {

        referralCode = generateReferralCode();

        const clientExists = await clientModel.exists({
            referralCode
        });
        const agentExists = await agentModel.exists({
            referralCode
        });
        exists = clientExists || agentExists;
    }

    return referralCode;
};

module.exports = generateUniqueReferralCode;