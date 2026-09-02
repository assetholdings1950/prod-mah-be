const mongoose = require("mongoose");
const walletDetailModel = require("../models/walletDetail.model");
const clientModel = require("../models/client.model");
const agentModel = require("../models/agent.model");
const UserModel = require("../models/user.model");
const { default: sendNotificationMail } = require("../emailTemplate/sendNotificationMail");

const getUserEmailAndName = async (userId, userModel) => {
    try {
        let userObj;
        if (userModel === "Client") {
            userObj = await clientModel.findById(userId);
        } else if (userModel === "Agent") {
            userObj = await agentModel.findById(userId);
        } else if (userModel === "User") {
            userObj = await UserModel.findById(userId);
        }
        if (userObj) {
            return {
                email: userObj.email,
                name: `${userObj.firstName || ""} ${userObj.lastName || ""}`.trim() || userObj.fullName || "User"
            };
        }
    } catch (e) {
        console.error("Failed to find user email/name in wallet query:", e);
    }
    return null;
};

const getWalletsByUserIdQuery = async ({ userId, userModel }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }

        if (!["User", "Agent", "Client"].includes(userModel)) {
            return { status: false, statusCode: 400, message: "userModel must be User, Agent, or Client." };
        }

        const wallets = await walletDetailModel
            .find({ userId: mongoose.Types.ObjectId.createFromHexString(userId), userModel })
            .sort({ isPrimary: -1, createdAt: -1 })
            .lean();

        return { status: true, statusCode: 200, wallets };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

const addWalletQuery = async ({ userId, userModel, network, walletAddress, label, isPrimary }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }

        if (!["User", "Agent", "Client"].includes(userModel)) {
            return { status: false, statusCode: 400, message: "userModel must be User, Agent, or Client." };
        }

        if (!network || !network.trim()) {
            return { status: false, statusCode: 400, message: "Network is required." };
        }

        if (!walletAddress || !walletAddress.trim()) {
            return { status: false, statusCode: 400, message: "Wallet address is required." };
        }

        const userObjectId = mongoose.Types.ObjectId.createFromHexString(userId);

        if (isPrimary) {
            await walletDetailModel.updateMany(
                { userId: userObjectId, userModel },
                { $set: { isPrimary: false } }
            );
        }

        const wallet = await walletDetailModel.create({
            userId: userObjectId,
            userModel,
            network: network.trim(),
            walletAddress: walletAddress.trim(),
            label: label || null,
            isPrimary: isPrimary || false,
        });

        // Send email alert to user
        try {
            const userDetails = await getUserEmailAndName(userId, userModel);
            if (userDetails) {
                await sendNotificationMail({
                    to: userDetails.email,
                    subject: "New Wallet Detail Linked | Merlion Asset Holdings",
                    title: "New Crypto Wallet Registered",
                    message: `A new cryptocurrency wallet has been successfully linked to your profile. If you did not authorize this change, please contact security immediately.`,
                    details: [
                        { label: "Wallet Label", value: wallet.label || "N/A" },
                        { label: "Network", value: wallet.network },
                        { label: "Wallet Address", value: wallet.walletAddress },
                        { label: "Status", value: wallet.isPrimary ? "Primary Wallet" : "Linked Wallet" }
                    ]
                });
            }
        } catch (mailError) {
            console.error("Failed to send add wallet email:", mailError);
        }

        return { status: true, statusCode: 201, message: "Wallet added successfully.", data: wallet };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

const updateWalletQuery = async ({ _id, network, walletAddress, label, isPrimary }) => {
    try {
        if (!_id || !_id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid wallet id." };
        }

        const existing = await walletDetailModel.findById(_id);
        if (!existing) {
            return { status: false, statusCode: 404, message: "Wallet not found." };
        }

        if (isPrimary) {
            await walletDetailModel.updateMany(
                { userId: existing.userId, userModel: existing.userModel, _id: { $ne: existing._id } },
                { $set: { isPrimary: false } }
            );
        }

        const updated = await walletDetailModel.findByIdAndUpdate(
            _id,
            {
                $set: {
                    network: network ? network.trim() : existing.network,
                    walletAddress: walletAddress ? walletAddress.trim() : existing.walletAddress,
                    label: label !== undefined ? label : existing.label,
                    isPrimary: isPrimary !== undefined ? isPrimary : existing.isPrimary,
                },
            },
            { new: true }
        );

        // Send email alert to user
        try {
            const userDetails = await getUserEmailAndName(existing.userId, existing.userModel);
            if (userDetails) {
                await sendNotificationMail({
                    to: userDetails.email,
                    subject: "Wallet Detail Updated | Merlion Asset Holdings",
                    title: "Crypto Wallet Modified",
                    message: `Your linked cryptocurrency wallet address has been successfully updated. If you did not make this change, please contact security immediately.`,
                    details: [
                        { label: "Wallet Label", value: updated.label || "N/A" },
                        { label: "Network", value: updated.network },
                        { label: "Wallet Address", value: updated.walletAddress },
                        { label: "Status", value: updated.isPrimary ? "Primary Wallet" : "Linked Wallet" }
                    ]
                });
            }
        } catch (mailError) {
            console.error("Failed to send update wallet email:", mailError);
        }

        return { status: true, statusCode: 200, message: "Wallet updated successfully.", data: updated };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

const deleteWalletQuery = async (id) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid wallet id." };
        }

        const deleted = await walletDetailModel.findByIdAndDelete(id);
        if (!deleted) {
            return { status: false, statusCode: 404, message: "Wallet not found." };
        }

        // Send email alert to user
        try {
            const userDetails = await getUserEmailAndName(deleted.userId, deleted.userModel);
            if (userDetails) {
                await sendNotificationMail({
                    to: userDetails.email,
                    subject: "Wallet Detail Removed | Merlion Asset Holdings",
                    title: "Crypto Wallet Deleted",
                    message: `A linked cryptocurrency wallet address has been removed from your account. If you did not make this change, please contact security immediately.`,
                    details: [
                        { label: "Wallet Label", value: deleted.label || "N/A" },
                        { label: "Network", value: deleted.network },
                        { label: "Wallet Address", value: deleted.walletAddress }
                    ]
                });
            }
        } catch (mailError) {
            console.error("Failed to send delete wallet email:", mailError);
        }

        return { status: true, statusCode: 200, message: "Wallet deleted successfully." };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

module.exports = {
    getWalletsByUserIdQuery,
    addWalletQuery,
    updateWalletQuery,
    deleteWalletQuery,
};
