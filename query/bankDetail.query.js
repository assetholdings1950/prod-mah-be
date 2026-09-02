const mongoose = require("mongoose");
const bankDetailModel = require("../models/bankDetail.model");
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
        console.error("Failed to find user email/name in bank query:", e);
    }
    return null;
};

const getBankDetailsByUserIdQuery = async ({ userId, userModel }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }

        if (!["User", "Agent", "Client"].includes(userModel)) {
            return { status: false, statusCode: 400, message: "userModel must be User, Agent, or Client." };
        }

        const bankDetails = await bankDetailModel
            .find({ userId: mongoose.Types.ObjectId.createFromHexString(userId), userModel })
            .sort({ isPrimary: -1, createdAt: -1 })
            .lean();

        return { status: true, statusCode: 200, data: bankDetails };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

const addBankDetailQuery = async ({ userId, userModel, bankName, branchName, accountName, accountNumber, ifscCode, swiftCode, isPrimary }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }

        if (!["User", "Agent", "Client"].includes(userModel)) {
            return { status: false, statusCode: 400, message: "userModel must be User, Agent, or Client." };
        }

        if (!accountNumber || !accountNumber.trim()) {
            return { status: false, statusCode: 400, message: "Account number is required." };
        }

        const userObjectId = mongoose.Types.ObjectId.createFromHexString(userId);

        if (isPrimary) {
            await bankDetailModel.updateMany(
                { userId: userObjectId, userModel },
                { $set: { isPrimary: false } }
            );
        }

        const bankDetail = await bankDetailModel.create({
            userId: userObjectId,
            userModel,
            bankName: bankName || null,
            branchName: branchName || null,
            accountName: accountName || null,
            accountNumber: accountNumber.trim(),
            ifscCode: ifscCode ? ifscCode.toUpperCase().trim() : null,
            swiftCode: swiftCode ? swiftCode.toUpperCase().trim() : null,
            isPrimary: isPrimary || false,
        });

        // Send email alert to user
        try {
            const userDetails = await getUserEmailAndName(userId, userModel);
            if (userDetails) {
                await sendNotificationMail({
                    to: userDetails.email,
                    subject: "New Bank Detail Linked | Merlion Asset Holdings",
                    title: "New Bank Account Registered",
                    message: `A new bank account has been successfully linked to your profile. If you did not authorize this change, please contact security immediately.`,
                    details: [
                        { label: "Bank Name", value: bankDetail.bankName || "N/A" },
                        { label: "Account Name", value: bankDetail.accountName || "N/A" },
                        { label: "Account Number", value: bankDetail.accountNumber ? `******${bankDetail.accountNumber.slice(-4)}` : "N/A" },
                        { label: "Status", value: bankDetail.isPrimary ? "Primary Payout Method" : "Linked Method" }
                    ]
                });
            }
        } catch (mailError) {
            console.error("Failed to send add bank detail email:", mailError);
        }

        return { status: true, statusCode: 201, message: "Bank detail added successfully.", data: bankDetail };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

const updateBankDetailQuery = async ({ _id, bankName, branchName, accountName, accountNumber, ifscCode, swiftCode, isPrimary }) => {
    try {
        if (!_id || !_id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid bank detail id." };
        }

        const existing = await bankDetailModel.findById(_id);
        if (!existing) {
            return { status: false, statusCode: 404, message: "Bank detail not found." };
        }

        if (isPrimary) {
            await bankDetailModel.updateMany(
                { userId: existing.userId, userModel: existing.userModel, _id: { $ne: existing._id } },
                { $set: { isPrimary: false } }
            );
        }

        const updated = await bankDetailModel.findByIdAndUpdate(
            _id,
            {
                $set: {
                    bankName: bankName ?? existing.bankName,
                    branchName: branchName ?? existing.branchName,
                    accountName: accountName ?? existing.accountName,
                    accountNumber: accountNumber ? accountNumber.trim() : existing.accountNumber,
                    ifscCode: ifscCode ? ifscCode.toUpperCase().trim() : existing.ifscCode,
                    swiftCode: swiftCode ? swiftCode.toUpperCase().trim() : existing.swiftCode,
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
                    subject: "Bank Detail Updated | Merlion Asset Holdings",
                    title: "Bank Account Modified",
                    message: `Your linked bank details have been successfully updated. If you did not make this change, please contact security immediately.`,
                    details: [
                        { label: "Bank Name", value: updated.bankName || "N/A" },
                        { label: "Account Name", value: updated.accountName || "N/A" },
                        { label: "Account Number", value: updated.accountNumber ? `******${updated.accountNumber.slice(-4)}` : "N/A" },
                        { label: "Status", value: updated.isPrimary ? "Primary Payout Method" : "Linked Method" }
                    ]
                });
            }
        } catch (mailError) {
            console.error("Failed to send update bank detail email:", mailError);
        }

        return { status: true, statusCode: 200, message: "Bank detail updated successfully.", data: updated };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

const deleteBankDetailQuery = async (id) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid bank detail id." };
        }

        const deleted = await bankDetailModel.findByIdAndDelete(id);
        if (!deleted) {
            return { status: false, statusCode: 404, message: "Bank detail not found." };
        }

        // Send email alert to user
        try {
            const userDetails = await getUserEmailAndName(deleted.userId, deleted.userModel);
            if (userDetails) {
                await sendNotificationMail({
                    to: userDetails.email,
                    subject: "Bank Detail Removed | Merlion Asset Holdings",
                    title: "Bank Account Deleted",
                    message: `A linked bank detail record has been removed from your account. If you did not make this change, please contact security immediately.`,
                    details: [
                        { label: "Bank Name", value: deleted.bankName || "N/A" },
                        { label: "Account Name", value: deleted.accountName || "N/A" },
                        { label: "Account Number", value: deleted.accountNumber ? `******${deleted.accountNumber.slice(-4)}` : "N/A" }
                    ]
                });
            }
        } catch (mailError) {
            console.error("Failed to send delete bank detail email:", mailError);
        }

        return { status: true, statusCode: 200, message: "Bank detail deleted successfully." };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

module.exports = {
    getBankDetailsByUserIdQuery,
    addBankDetailQuery,
    updateBankDetailQuery,
    deleteBankDetailQuery,
};
