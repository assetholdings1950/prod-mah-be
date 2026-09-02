const mongoose = require("mongoose");
const { convertCurrency } = require("../services/currency.service");
const withdrawalRequestModel = require("../models/withdrawalRequest.model");
const userWalletModel = require("../models/userWallet.model");
const bankDetailModel = require("../models/bankDetail.model");
const walletDetailModel = require("../models/walletDetail.model");
const transactionModel = require("../models/transaction.model");
const clientModel = require("../models/client.model");
const agentModel = require("../models/agent.model");
const { default: sendNotificationMail } = require("../emailTemplate/sendNotificationMail");


const userProjection = { firstName: 1, lastName: 1, fullName: 1, email: 1, clientId: 1, agentId: 1, profileImage: 1 };

const ownerLookupStages = [
    {
        $lookup: {
            from: "users",
            let: { uid: "$userId" },
            pipeline: [
                { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
                { $project: userProjection }
            ],
            as: "_fromUsers"
        }
    },
    {
        $lookup: {
            from: "clients",
            let: { uid: "$userId" },
            pipeline: [
                { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
                { $project: userProjection }
            ],
            as: "_fromClients"
        }
    },
    {
        $lookup: {
            from: "agents",
            let: { uid: "$userId" },
            pipeline: [
                { $match: { $expr: { $eq: ["$_id", "$$uid"] } } },
                { $project: userProjection }
            ],
            as: "_fromAgents"
        }
    },
    {
        $addFields: {
            userId: {
                $switch: {
                    branches: [
                        { case: { $eq: ["$userModel", "Client"] }, then: { $arrayElemAt: ["$_fromClients", 0] } },
                        { case: { $eq: ["$userModel", "Agent"] }, then: { $arrayElemAt: ["$_fromAgents", 0] } }
                    ],
                    default: { $arrayElemAt: ["$_fromUsers", 0] }
                }
            }
        }
    },
    { $project: { _fromUsers: 0, _fromClients: 0, _fromAgents: 0 } }
];

// ─── Create ───────────────────────────────────────────────────────────────────

const createWithdrawalRequestQuery = async ({ userId, userModel, amount, currency, withdrawalMethod, bankDetailId, walletId, note }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }

        if (!["User", "Agent", "Client"].includes(userModel)) {
            return { status: false, statusCode: 400, message: "userModel must be User, Agent, or Client." };
        }

        if (!amount || amount <= 0) {
            return { status: false, statusCode: 400, message: "Amount must be greater than 0." };
        }

        if (!["bank", "wallet"].includes(withdrawalMethod)) {
            return { status: false, statusCode: 400, message: "withdrawalMethod must be bank or wallet." };
        }

        if (withdrawalMethod === "bank") {
            if (!bankDetailId || !bankDetailId.match(/^[0-9a-fA-F]{24}$/)) {
                return { status: false, statusCode: 400, message: "bankDetailId is required for bank withdrawals." };
            }
            const bank = await bankDetailModel.findOne({ _id: bankDetailId, userId, userModel });
            if (!bank) {
                return { status: false, statusCode: 404, message: "Bank detail not found or does not belong to this user." };
            }
        }

        if (withdrawalMethod === "wallet") {
            if (!walletId || !walletId.match(/^[0-9a-fA-F]{24}$/)) {
                return { status: false, statusCode: 400, message: "walletId is required for wallet withdrawals." };
            }
            const wallet = await walletDetailModel.findOne({ _id: walletId, userId, userModel });
            if (!wallet) {
                return { status: false, statusCode: 404, message: "Wallet not found or does not belong to this user." };
            }
        }

        const requestCurrency = (currency || "USD").toUpperCase();
        const userWallet = await userWalletModel.findOne({ userId, userModel, currency: requestCurrency });
        if (!userWallet || userWallet.balance < amount) {
            return { status: false, statusCode: 400, message: `Insufficient ${requestCurrency} balance.` };
        }

        const request = await withdrawalRequestModel.create({
            userId,
            userModel,
            amount,
            currency: currency || "USD",
            withdrawalMethod,
            bankDetailId: withdrawalMethod === "bank" ? bankDetailId : null,
            walletId: withdrawalMethod === "wallet" ? walletId : null,
            note: note || "",
            status: "pending",
        });

        // Send notification emails
        try {
            let userObj;
            if (userModel === "Client") {
                userObj = await clientModel.findById(userId);
            } else if (userModel === "Agent") {
                userObj = await agentModel.findById(userId);
            }
            if (userObj) {
                // User notification
                await sendNotificationMail({
                    to: userObj.email,
                    subject: "Withdrawal Request Submitted | Merlion Asset Holdings",
                    title: "Withdrawal Request Pending Approval",
                    message: `Your withdrawal request of ${amount} ${currency || "USD"} has been successfully submitted and is currently pending review.`,
                    details: [
                        { label: "Request ID", value: request._id.toString() },
                        { label: "Amount", value: `${amount} ${currency || "USD"}` },
                        { label: "Method", value: withdrawalMethod.toUpperCase() },
                        { label: "Status", value: "Pending Approval" }
                    ]
                });

                // Admin notification
                const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
                await sendNotificationMail({
                    to: adminEmail,
                    subject: `New Withdrawal Request Submitted: ${userObj.firstName} ${userObj.lastName}`,
                    title: "New Withdrawal Request",
                    message: `A new withdrawal request of ${amount} ${currency || "USD"} has been submitted by ${userObj.firstName} ${userObj.lastName} (${userModel}) and is pending approval.`,
                    details: [
                        { label: "User Name", value: userObj.fullName },
                        { label: "User Email", value: userObj.email },
                        { label: "User Type", value: userModel },
                        { label: "Amount", value: `${amount} ${currency || "USD"}` },
                        { label: "Method", value: withdrawalMethod.toUpperCase() },
                        { label: "Status", value: "Pending Approval" }
                    ]
                });
            }
        } catch (notifError) {
            console.error("Failed to send withdrawal request submission emails:", notifError);
        }

        return { status: true, statusCode: 201, message: "Withdrawal request submitted successfully.", data: request };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

// ─── User: my list ────────────────────────────────────────────────────────────

const userWithdrawalListQuery = async ({ userId, userModel, page = 1, limit = 10, status }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }

        const matchQuery = { userId: mongoose.Types.ObjectId.createFromHexString(userId) };
        if (status) matchQuery.status = status;

        const aggregate = withdrawalRequestModel.aggregate([
            { $match: matchQuery },
            {
                $lookup: {
                    from: "bankdetails",
                    localField: "bankDetailId",
                    foreignField: "_id",
                    as: "bankDetailId"
                }
            },
            { $addFields: { bankDetailId: { $arrayElemAt: ["$bankDetailId", 0] } } },
            {
                $lookup: {
                    from: "walletdetails",
                    localField: "walletId",
                    foreignField: "_id",
                    as: "walletId"
                }
            },
            { $addFields: { walletId: { $arrayElemAt: ["$walletId", 0] } } },
            { $sort: { createdAt: -1 } }
        ]);

        const result = await withdrawalRequestModel.aggregatePaginate(aggregate, { page, limit });
        return { status: true, statusCode: 200, data: result };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

// ─── User: single ─────────────────────────────────────────────────────────────

const getUserWithdrawalByIdQuery = async ({ id, userId }) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid id." };
        }

        const request = await withdrawalRequestModel.findOne({
            _id: id,
            userId: mongoose.Types.ObjectId.createFromHexString(userId)
        })
            .populate("bankDetailId")
            .populate("walletId")
            .lean();

        if (!request) {
            return { status: false, statusCode: 404, message: "Withdrawal request not found." };
        }

        return { status: true, statusCode: 200, data: request };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

// ─── Admin: list ──────────────────────────────────────────────────────────────

const adminWithdrawalListQuery = async ({ page = 1, limit = 10, search, status, userModel, userId }) => {
    try {
        const matchQuery = {};
        if (status) matchQuery.status = status;
        if (userModel) matchQuery.userModel = userModel;
        if (userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
            matchQuery.userId = mongoose.Types.ObjectId.createFromHexString(userId);
        }

        const aggregate = withdrawalRequestModel.aggregate([
            { $match: matchQuery },
            ...ownerLookupStages,
            {
                $lookup: {
                    from: "bankdetails",
                    localField: "bankDetailId",
                    foreignField: "_id",
                    as: "bankDetailId"
                }
            },
            { $addFields: { bankDetailId: { $arrayElemAt: ["$bankDetailId", 0] } } },
            {
                $lookup: {
                    from: "walletdetails",
                    localField: "walletId",
                    foreignField: "_id",
                    as: "walletId"
                }
            },
            { $addFields: { walletId: { $arrayElemAt: ["$walletId", 0] } } },
            ...(search ? [{
                $match: {
                    $or: [
                        { "userId.email": { $regex: search, $options: "i" } },
                        { "userId.firstName": { $regex: search, $options: "i" } },
                        { "userId.lastName": { $regex: search, $options: "i" } },
                        { "userId.clientId": { $regex: search, $options: "i" } },
                    ]
                }
            }] : []),
            { $sort: { createdAt: -1 } }
        ]);

        const result = await withdrawalRequestModel.aggregatePaginate(aggregate, { page, limit });
        return { status: true, statusCode: 200, data: result };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

// ─── Admin: single ────────────────────────────────────────────────────────────

const adminGetWithdrawalByIdQuery = async (id) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid id." };
        }

        const [result] = await withdrawalRequestModel.aggregate([
            { $match: { _id: mongoose.Types.ObjectId.createFromHexString(id) } },
            ...ownerLookupStages,
            {
                $lookup: {
                    from: "bankdetails",
                    localField: "bankDetailId",
                    foreignField: "_id",
                    as: "bankDetailId"
                }
            },
            { $addFields: { bankDetailId: { $arrayElemAt: ["$bankDetailId", 0] } } },
            {
                $lookup: {
                    from: "walletdetails",
                    localField: "walletId",
                    foreignField: "_id",
                    as: "walletId"
                }
            },
            { $addFields: { walletId: { $arrayElemAt: ["$walletId", 0] } } },
        ]);

        if (!result) {
            return { status: false, statusCode: 404, message: "Withdrawal request not found." };
        }

        return { status: true, statusCode: 200, data: result };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

// ─── Admin: approve ───────────────────────────────────────────────────────────

const approveWithdrawalQuery = async ({ id, adminId }) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid withdrawal id." };
        }

        const request = await withdrawalRequestModel.findById(id);
        if (!request) {
            return { status: false, statusCode: 404, message: "Withdrawal request not found." };
        }

        if (request.status === "approved") {
            return { status: false, statusCode: 400, message: "Withdrawal is already approved." };
        }

        if (request.status === "rejected") {
            return { status: false, statusCode: 400, message: "Cannot approve a rejected withdrawal." };
        }

        const withdrawalCurrency = (request.currency || "USD").toUpperCase();
        const userWallet = await userWalletModel.findOne({ userId: request.userId, userModel: request.userModel, currency: withdrawalCurrency });
        if (!userWallet || userWallet.balance < request.amount) {
            return { status: false, statusCode: 400, message: `Insufficient ${withdrawalCurrency} balance to approve withdrawal.` };
        }

        let conversion = null;
        try {
            conversion = await convertCurrency(withdrawalCurrency, "USD", request.amount);
        } catch (conversionError) {
            console.error(`[Withdrawal Approval] USD snapshot unavailable for ${withdrawalCurrency}:`, conversionError.message);
        }

        await userWalletModel.findOneAndUpdate(
            { userId: request.userId, userModel: request.userModel, currency: withdrawalCurrency },
            {
                $inc: {
                    balance: -request.amount,
                    totalWithdrawn: request.amount,
                }
            }
        );

        const updated = await withdrawalRequestModel.findByIdAndUpdate(
            id,
            {
                $set: {
                    status: "approved",
                    approvedBy: adminId,
                    approvedAt: new Date(),
                    ...(conversion && {
                        conversion: {
                            usdAmount: conversion.convertedAmount,
                            rateToUsd: conversion.rate,
                            source: conversion.source,
                            convertedAt: conversion.lastUpdated || new Date(),
                        },
                    }),
                },
            },
            { new: true }
        );

        await transactionModel.create({
            userId: request.userId,
            userModel: request.userModel,
            type: "withdrawal",
            amount: request.amount,
            currency: withdrawalCurrency,
            usdAmount: conversion?.convertedAmount ?? null,
            rateToUsd: conversion?.rate ?? null,
            rateSource: conversion?.source ?? null,
            convertedAt: conversion?.lastUpdated ?? null,
            status: "completed",
            referenceId: request._id,
            description: `Withdrawal of ${request.amount} ${withdrawalCurrency} approved.`,
            createdBy: adminId,
        });

        // Send notification emails
        try {
            let userObj;
            if (request.userModel === "Client") {
                userObj = await clientModel.findById(request.userId);
            } else if (request.userModel === "Agent") {
                userObj = await agentModel.findById(request.userId);
            }
            if (userObj) {
                // User notification
                await sendNotificationMail({
                    to: userObj.email,
                    subject: "Withdrawal Successful | Merlion Asset Holdings",
                    title: "Withdrawal Successful",
                    message: `You have successfully withdrawn ${request.amount} ${withdrawalCurrency}. The funds have been sent to your chosen withdrawal destination.`,
                    details: [
                        { label: "Transaction ID", value: request._id.toString() },
                        { label: "Amount Debited", value: `${request.amount} ${withdrawalCurrency}` },
                        { label: "Method", value: request.withdrawalMethod.toUpperCase() },
                        { label: "Status", value: "Approved / Completed" }
                    ]
                });

                // Admin notification
                const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
                await sendNotificationMail({
                    to: adminEmail,
                    subject: `Withdrawal Request Approved: ${userObj.firstName} ${userObj.lastName}`,
                    title: "Withdrawal Request Approved",
                    message: `The withdrawal request of ${request.amount} ${withdrawalCurrency} submitted by ${userObj.firstName} ${userObj.lastName} (${request.userModel}) has been successfully approved and processed.`,
                    details: [
                        { label: "User Name", value: userObj.fullName },
                        { label: "User Email", value: userObj.email },
                        { label: "User Type", value: request.userModel },
                        { label: "Amount", value: `${request.amount} ${withdrawalCurrency}` },
                        { label: "Transaction ID", value: request._id.toString() },
                        { label: "Status", value: "Success" }
                    ]
                });
            }
        } catch (notifError) {
            console.error("Failed to send withdrawal approval emails:", notifError);
        }

        // Sync agent stats if applicable
        try {
            const { syncAgentStats } = require("./agent.query");
            if (request.userModel === "Agent") {
                await syncAgentStats(request.userId);
            } else if (request.userModel === "Client") {
                const client = await clientModel.findById(request.userId);
                if (client && client.agent) {
                    await syncAgentStats(client.agent);
                }
            }
        } catch (syncErr) {
            console.error("Failed to sync agent stats after withdrawal approval:", syncErr);
        }

        return { status: true, statusCode: 200, message: "Withdrawal approved successfully.", data: updated };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

// ─── Admin: reject ────────────────────────────────────────────────────────────

const rejectWithdrawalQuery = async ({ id, adminId, adminNote }) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid withdrawal id." };
        }

        const request = await withdrawalRequestModel.findById(id);
        if (!request) {
            return { status: false, statusCode: 404, message: "Withdrawal request not found." };
        }

        if (request.status === "approved") {
            return { status: false, statusCode: 400, message: "Cannot reject an already approved withdrawal." };
        }

        if (request.status === "rejected") {
            return { status: false, statusCode: 400, message: "Withdrawal request is already rejected." };
        }

        const updated = await withdrawalRequestModel.findByIdAndUpdate(
            id,
            { $set: { status: "rejected", rejectedBy: adminId, rejectedAt: new Date(), adminNote: adminNote || "" } },
            { new: true }
        );

        // Send notification email
        try {
            let userObj;
            if (request.userModel === "Client") {
                userObj = await clientModel.findById(request.userId);
            } else if (request.userModel === "Agent") {
                userObj = await agentModel.findById(request.userId);
            }
            if (userObj) {
                const withdrawalCurrency = (request.currency || "USD").toUpperCase();
                await sendNotificationMail({
                    to: userObj.email,
                    subject: "Withdrawal Request Declined | Merlion Asset Holdings",
                    title: "Withdrawal Declined",
                    message: `Your withdrawal request of ${request.amount} ${withdrawalCurrency} has been declined.`,
                    details: [
                        { label: "Transaction ID", value: request._id.toString() },
                        { label: "Amount Requested", value: `${request.amount} ${withdrawalCurrency}` },
                        { label: "Reason / Note", value: adminNote || "No specific reason provided." },
                        { label: "Status", value: "Declined" }
                    ]
                });
            }
        } catch (notifError) {
            console.error("Failed to send withdrawal rejection email:", notifError);
        }

        // Sync agent stats if applicable
        try {
            const { syncAgentStats } = require("./agent.query");
            if (request.userModel === "Agent") {
                await syncAgentStats(request.userId);
            } else if (request.userModel === "Client") {
                const client = await clientModel.findById(request.userId);
                if (client && client.agent) {
                    await syncAgentStats(client.agent);
                }
            }
        } catch (syncErr) {
            console.error("Failed to sync agent stats after withdrawal rejection:", syncErr);
        }

        return { status: true, statusCode: 200, message: "Withdrawal rejected.", data: updated };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

// ─── Admin: bulk approve ──────────────────────────────────────────────────────

const bulkApproveWithdrawalsQuery = async ({ ids, adminId }) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { status: false, statusCode: 400, message: "No IDs provided." };
    }

    const approved = [], skipped = [], failed = [];

    for (const id of ids) {
        try {
            const result = await approveWithdrawalQuery({ id, adminId });
            if (result.status) approved.push(id);
            else skipped.push({ id, reason: result.message });
        } catch (err) {
            failed.push({ id, reason: err.message });
        }
    }

    return {
        status: true,
        statusCode: 200,
        message: `${approved.length} approved. ${skipped.length} skipped. ${failed.length} failed.`,
        results: { approved, skipped, failed }
    };
};

// ─── Admin: bulk reject ───────────────────────────────────────────────────────

const bulkRejectWithdrawalsQuery = async ({ ids, adminId, adminNote }) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { status: false, statusCode: 400, message: "No IDs provided." };
    }

    const rejected = [], skipped = [], failed = [];

    for (const id of ids) {
        try {
            const result = await rejectWithdrawalQuery({ id, adminId, adminNote });
            if (result.status) rejected.push(id);
            else skipped.push({ id, reason: result.message });
        } catch (err) {
            failed.push({ id, reason: err.message });
        }
    }

    return {
        status: true,
        statusCode: 200,
        message: `${rejected.length} rejected. ${skipped.length} skipped. ${failed.length} failed.`,
        results: { rejected, skipped, failed }
    };
};

// ─── Admin: summary ───────────────────────────────────────────────────────────

const withdrawalSummaryQuery = async () => {
    try {
        const [result] = await withdrawalRequestModel.aggregate([
            {
                $facet: {
                    byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
                    byUserModel: [{ $group: { _id: "$userModel", count: { $sum: 1 } } }],
                    approvedVolumeByCurrency: [
                        { $match: { status: "approved" } },
                        { $group: { _id: "$currency", total: { $sum: "$amount" }, count: { $sum: 1 } } },
                        { $sort: { total: -1 } }
                    ]
                }
            }
        ]);

        const statusMap = {};
        for (const s of (result?.byStatus ?? [])) statusMap[s._id] = s.count;

        const userModelMap = {};
        for (const u of (result?.byUserModel ?? [])) userModelMap[u._id] = u.count;

        const approvedVolumeByCurrency = {};
        for (const v of (result?.approvedVolumeByCurrency ?? [])) {
            approvedVolumeByCurrency[v._id] = { total: v.total, count: v.count };
        }

        return {
            status: true,
            statusCode: 200,
            summary: {
                pendingCount: statusMap.pending ?? 0,
                approvedCount: statusMap.approved ?? 0,
                rejectedCount: statusMap.rejected ?? 0,
                totalAgentRequests: userModelMap.Agent ?? 0,
                totalClientRequests: userModelMap.Client ?? 0,
                approvedVolumeByCurrency,
            }
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

// ─── Admin: delete ────────────────────────────────────────────────────────────

const deleteAllWithdrawalsQuery = async () => {
    try {
        const result = await withdrawalRequestModel.deleteMany({});
        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} withdrawal record(s) deleted.`,
            deletedCount: result.deletedCount
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const deleteWithdrawalsQuery = async (ids) => {
    try {
        if (!Array.isArray(ids) || ids.length === 0) {
            return { status: false, statusCode: 400, message: "No IDs provided." };
        }

        const objectIds = ids
            .filter(id => id && id.match(/^[0-9a-fA-F]{24}$/))
            .map(id => mongoose.Types.ObjectId.createFromHexString(id));

        if (objectIds.length === 0) {
            return { status: false, statusCode: 400, message: "No valid IDs provided." };
        }

        const result = await withdrawalRequestModel.deleteMany({ _id: { $in: objectIds } });

        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} withdrawal record(s) deleted.`,
            deletedCount: result.deletedCount
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

module.exports = {
    createWithdrawalRequestQuery,
    userWithdrawalListQuery,
    getUserWithdrawalByIdQuery,
    adminWithdrawalListQuery,
    adminGetWithdrawalByIdQuery,
    withdrawalSummaryQuery,
    approveWithdrawalQuery,
    rejectWithdrawalQuery,
    bulkApproveWithdrawalsQuery,
    bulkRejectWithdrawalsQuery,
    deleteWithdrawalsQuery,
    deleteAllWithdrawalsQuery,
};
