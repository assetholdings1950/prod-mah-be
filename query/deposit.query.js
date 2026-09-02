const mongoose = require("mongoose");
const { convertCurrency } = require("../services/currency.service");
const depositRequestModel = require("../models/depositRequest.model");
const userWalletModel = require("../models/userWallet.model");
const transactionModel = require("../models/transaction.model");
const paymentMethodModel = require("../models/paymentMethod.model");
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


const createDepositRequestQuery = async (details) => {
    try {
        const {
            userId, userModel, paymentMethodId, amount, currency, network,
            transactionHash, senderWalletAddress, paymentProofUrl, note
        } = details;

        if (!userId || !paymentMethodId || !amount || !currency || !paymentProofUrl) {
            return { status: false, statusCode: 400, message: "User, payment method, amount, currency, and payment proof are required." };
        }

        if (!["User", "Agent", "Client"].includes(userModel)) {
            return { status: false, statusCode: 400, message: "userModel must be User, Agent, or Client." };
        }

        if (!paymentMethodId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid paymentMethodId." };
        }

        const paymentMethod = await paymentMethodModel.findOne({ _id: paymentMethodId, status: "active" });
        if (!paymentMethod) {
            return { status: false, statusCode: 404, message: "Payment method not found or inactive." };
        }

        if (paymentMethod.minDeposit && amount < paymentMethod.minDeposit) {
            return { status: false, statusCode: 400, message: `Minimum deposit amount is ${paymentMethod.minDeposit} ${currency}.` };
        }

        if (paymentMethod.maxDeposit && amount > paymentMethod.maxDeposit) {
            return { status: false, statusCode: 400, message: `Maximum deposit amount is ${paymentMethod.maxDeposit} ${currency}.` };
        }

        const ownerModel = userModel === "Client" ? clientModel : userModel === "Agent" ? agentModel : null;
        const owner = ownerModel ? await ownerModel.findById(userId, "firstName lastName fullName").lean() : null;
        if (!owner) {
            return { status: false, statusCode: 404, message: "Deposit owner not found." };
        }

        const displayName = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.fullName || "client";
        const ownerFolderName = displayName
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            || "client";
        try {
            const proofUrl = new URL(paymentProofUrl);
            const validProof = proofUrl.protocol === "https:"
                && proofUrl.hostname === "res.cloudinary.com"
                && proofUrl.pathname.includes("/image/upload/")
                && proofUrl.pathname.includes(`/clients/${ownerFolderName}/deposits/`);
            if (!validProof) throw new Error("Invalid proof URL");
        } catch {
            return { status: false, statusCode: 400, message: "Payment proof upload URL is invalid." };
        }

        const depositRequest = await depositRequestModel.create({
            userId, userModel, paymentMethodId, amount, currency,
            network: network || "",
            transactionHash: transactionHash || "",
            senderWalletAddress: senderWalletAddress || "",
            paymentProofUrl: paymentProofUrl || "",
            note: note || "",
            status: "pending"
        });

        // Send notification email
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
                    subject: "Deposit Request Submitted | Merlion Asset Holdings",
                    title: "Deposit Request Pending Approval",
                    message: `Your deposit request of ${amount} ${currency} has been successfully submitted and is currently pending review by our compliance team.`,
                    details: [
                        { label: "Request ID", value: depositRequest._id.toString() },
                        { label: "Amount", value: `${amount} ${currency}` },
                        { label: "Payment Method", value: paymentMethod.name || "Crypto Wallet" },
                        { label: "Status", value: "Pending Approval" }
                    ]
                });

                // Admin notification
                const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
                await sendNotificationMail({
                    to: adminEmail,
                    subject: `New Deposit Request Submitted: ${userObj.firstName} ${userObj.lastName}`,
                    title: "New Deposit Request",
                    message: `A new deposit request of ${amount} ${currency} has been submitted by ${userObj.firstName} ${userObj.lastName} (${userModel}) and is pending approval.`,
                    details: [
                        { label: "User Name", value: userObj.fullName },
                        { label: "User Email", value: userObj.email },
                        { label: "User Type", value: userModel },
                        { label: "Amount", value: `${amount} ${currency}` },
                        { label: "Payment Method", value: paymentMethod.name || "Crypto Wallet" },
                        { label: "Status", value: "Pending Approval" }
                    ]
                });
            }
        } catch (notifError) {
            console.error("Failed to send deposit request submission emails:", notifError);
        }

        return { status: true, statusCode: 200, message: "Deposit request submitted successfully.", depositRequest };

    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const userDepositListQuery = async ({ userId, page = 1, limit = 10, status }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }

        let matchQuery = { userId: mongoose.Types.ObjectId.createFromHexString(userId) };
        if (status) matchQuery.status = status;

        const aggregate = depositRequestModel.aggregate([
            { $match: matchQuery },
            ...ownerLookupStages,
            {
                $lookup: {
                    from: "paymentmethods",
                    localField: "paymentMethodId",
                    foreignField: "_id",
                    as: "paymentMethodId"
                }
            },
            { $addFields: { paymentMethodId: { $arrayElemAt: ["$paymentMethodId", 0] } } },
            { $sort: { createdAt: -1 } }
        ]);

        const deposits = await depositRequestModel.aggregatePaginate(aggregate, { page, limit });
        return { status: true, statusCode: 200, deposits };

    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};


const getUserDepositByIdQuery = async ({ id, userId }) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid deposit id." };
        }

        const [deposit] = await depositRequestModel.aggregate([
            {
                $match: {
                    _id: mongoose.Types.ObjectId.createFromHexString(id),
                    userId: mongoose.Types.ObjectId.createFromHexString(userId)
                }
            },
            ...ownerLookupStages,
            {
                $lookup: {
                    from: "paymentmethods",
                    localField: "paymentMethodId",
                    foreignField: "_id",
                    as: "paymentMethod"
                }
            },
            { $addFields: { paymentMethod: { $arrayElemAt: ["$paymentMethod", 0] } } }
        ]);

        if (!deposit) {
            return { status: false, statusCode: 404, message: "Deposit request not found." };
        }

        return { status: true, statusCode: 200, deposit };

    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const adminDepositListQuery = async ({ page = 1, limit = 10, search, status, currency, userModel, userId, paymentMethodId, startDate, endDate }) => {
    try {
        // Pre-lookup filters (fast — on indexed fields)
        let matchQuery = {};
        if (status) matchQuery.status = status;
        if (currency) matchQuery.currency = currency;
        if (userModel) matchQuery.userModel = userModel;
        if (userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
            matchQuery.userId = mongoose.Types.ObjectId.createFromHexString(userId);
        }
        if (paymentMethodId && paymentMethodId.match(/^[0-9a-fA-F]{24}$/)) {
            matchQuery.paymentMethodId = mongoose.Types.ObjectId.createFromHexString(paymentMethodId);
        }
        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
        }

        // Post-lookup search (on populated user fields + amount)
        let searchStage = null;
        if (search && search.trim()) {
            const regex = { $regex: search.trim(), $options: "i" };
            const orConditions = [
                { "userId.firstName": regex },
                { "userId.lastName": regex },
                { "userId.fullName": regex },
                { "userId.email": regex },
            ];
            const numericAmount = parseFloat(search.trim());
            if (!isNaN(numericAmount)) {
                orConditions.push({ amount: numericAmount });
            }
            searchStage = { $match: { $or: orConditions } };
        }

        const aggregate = depositRequestModel.aggregate([
            { $match: matchQuery },
            ...ownerLookupStages,
            ...(searchStage ? [searchStage] : []),
            {
                $lookup: {
                    from: "paymentmethods",
                    localField: "paymentMethodId",
                    foreignField: "_id",
                    as: "paymentMethodId"
                }
            },
            { $addFields: { paymentMethodId: { $arrayElemAt: ["$paymentMethodId", 0] } } },
            {
                $lookup: {
                    from: "users",
                    let: { approvedById: "$approvedBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$approvedById"] } } },
                        { $project: { fullName: 1, firstName: 1, lastName: 1, email: 1 } }
                    ],
                    as: "_approvedByUser"
                }
            },
            {
                $lookup: {
                    from: "users",
                    let: { rejectedById: "$rejectedBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$rejectedById"] } } },
                        { $project: { fullName: 1, firstName: 1, lastName: 1, email: 1 } }
                    ],
                    as: "_rejectedByUser"
                }
            },
            {
                $addFields: {
                    approvedBy: {
                        $cond: {
                            if: { $gt: [{ $size: "$_approvedByUser" }, 0] },
                            then: { $arrayElemAt: ["$_approvedByUser", 0] },
                            else: "$approvedBy"
                        }
                    },
                    rejectedBy: {
                        $cond: {
                            if: { $gt: [{ $size: "$_rejectedByUser" }, 0] },
                            then: { $arrayElemAt: ["$_rejectedByUser", 0] },
                            else: "$rejectedBy"
                        }
                    }
                }
            },
            { $project: { _approvedByUser: 0, _rejectedByUser: 0 } },
            { $sort: { createdAt: -1 } }
        ]);

        const deposits = await depositRequestModel.aggregatePaginate(aggregate, { page, limit });
        return { status: true, statusCode: 200, deposits };

    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};


const adminGetDepositByIdQuery = async (id) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid deposit id." };
        }

        const [deposit] = await depositRequestModel.aggregate([
            { $match: { _id: mongoose.Types.ObjectId.createFromHexString(id) } },
            ...ownerLookupStages,
            {
                $lookup: {
                    from: "paymentmethods",
                    localField: "paymentMethodId",
                    foreignField: "_id",
                    as: "paymentMethodId"
                }
            },
            { $addFields: { paymentMethodId: { $arrayElemAt: ["$paymentMethodId", 0] } } },
            {
                $lookup: {
                    from: "users",
                    let: { approvedById: "$approvedBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$approvedById"] } } },
                        { $project: { fullName: 1, firstName: 1, lastName: 1, email: 1 } }
                    ],
                    as: "approvedByUser"
                }
            },
            {
                $lookup: {
                    from: "users",
                    let: { rejectedById: "$rejectedBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$rejectedById"] } } },
                        { $project: { fullName: 1, firstName: 1, lastName: 1, email: 1 } }
                    ],
                    as: "rejectedByUser"
                }
            },
            {
                $addFields: {
                    approvedBy: {
                        $cond: {
                            if: { $gt: [{ $size: "$approvedByUser" }, 0] },
                            then: { $arrayElemAt: ["$approvedByUser", 0] },
                            else: "$approvedBy"
                        }
                    },
                    rejectedBy: {
                        $cond: {
                            if: { $gt: [{ $size: "$rejectedByUser" }, 0] },
                            then: { $arrayElemAt: ["$rejectedByUser", 0] },
                            else: "$rejectedBy"
                        }
                    }
                }
            },
            { $project: { approvedByUser: 0, rejectedByUser: 0 } }
        ]);

        if (!deposit) {
            return { status: false, statusCode: 404, message: "Deposit request not found." };
        }

        return { status: true, statusCode: 200, deposit };

    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const approveDepositQuery = async ({ id, adminId }) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            await session.abortTransaction();
            session.endSession();
            return { status: false, statusCode: 400, message: "Invalid deposit id." };
        }

        const deposit = await depositRequestModel.findById(id).session(session);

        if (!deposit) {
            await session.abortTransaction();
            session.endSession();
            return { status: false, statusCode: 404, message: "Deposit request not found." };
        }

        if (deposit.status === "approved") {
            await session.abortTransaction();
            session.endSession();
            return { status: false, statusCode: 400, message: "Deposit request has already been approved." };
        }

        if (deposit.status === "rejected") {
            await session.abortTransaction();
            session.endSession();
            return { status: false, statusCode: 400, message: "Cannot approve a rejected deposit request." };
        }

        let conversion = null;
        try {
            conversion = await convertCurrency(deposit.currency, "USD", deposit.amount);
        } catch (conversionError) {
            console.error(`[Deposit Approval] USD snapshot unavailable for ${deposit.currency}:`, conversionError.message);
        }

        deposit.status = "approved";
        deposit.approvedBy = adminId;
        deposit.approvedAt = new Date();
        if (conversion) {
            deposit.conversion = {
                usdAmount: conversion.convertedAmount,
                rateToUsd: conversion.rate,
                source: conversion.source,
                convertedAt: conversion.lastUpdated || new Date(),
            };
        }
        await deposit.save({ session });

        await userWalletModel.findOneAndUpdate(
            { userId: deposit.userId, userModel: deposit.userModel, currency: deposit.currency.toUpperCase() },
            { $inc: { balance: deposit.amount, totalDeposited: deposit.amount } },
            { upsert: true, new: true, session }
        );

        await transactionModel.create(
            [{
                userId: deposit.userId,
                userModel: deposit.userModel,
                type: "deposit",
                amount: deposit.amount,
                currency: deposit.currency,
                usdAmount: conversion?.convertedAmount ?? null,
                rateToUsd: conversion?.rate ?? null,
                rateSource: conversion?.source ?? null,
                convertedAt: conversion?.lastUpdated ?? null,
                status: "completed",
                referenceId: deposit._id,
                description: `Deposit of ${deposit.amount} ${deposit.currency} approved.`,
                createdBy: adminId
            }],
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        // Sync agent stats if applicable
        try {
            const { syncAgentStats } = require("./agent.query");
            if (deposit.userModel === "Agent") {
                await syncAgentStats(deposit.userId);
            } else if (deposit.userModel === "Client") {
                const client = await clientModel.findById(deposit.userId);
                if (client && client.agent) {
                    await syncAgentStats(client.agent);
                }
            }
        } catch (syncErr) {
            console.error("Failed to sync agent stats after deposit approval:", syncErr);
        }

        // Send notification email
        try {
            let userObj;
            if (deposit.userModel === "Client") {
                userObj = await clientModel.findById(deposit.userId);
            } else if (deposit.userModel === "Agent") {
                userObj = await agentModel.findById(deposit.userId);
            }
            if (userObj) {
                // User notification
                await sendNotificationMail({
                    to: userObj.email,
                    subject: "Deposit Successful | Merlion Asset Holdings",
                    title: "Deposit Successful",
                    message: `You have successfully deposited ${deposit.amount} ${deposit.currency}. The funds have been credited to your wallet balance.`,
                    details: [
                        { label: "Transaction ID", value: deposit._id.toString() },
                        { label: "Amount Credited", value: `${deposit.amount} ${deposit.currency}` },
                        { label: "Status", value: "Approved / Completed" }
                    ]
                });

                // Admin notification
                const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
                await sendNotificationMail({
                    to: adminEmail,
                    subject: `Deposit Request Approved: ${userObj.firstName} ${userObj.lastName}`,
                    title: "Deposit Request Approved",
                    message: `The deposit request of ${deposit.amount} ${deposit.currency} submitted by ${userObj.firstName} ${userObj.lastName} (${deposit.userModel}) has been successfully approved and processed.`,
                    details: [
                        { label: "User Name", value: userObj.fullName },
                        { label: "User Email", value: userObj.email },
                        { label: "User Type", value: deposit.userModel },
                        { label: "Amount", value: `${deposit.amount} ${deposit.currency}` },
                        { label: "Transaction ID", value: deposit._id.toString() },
                        { label: "Status", value: "Success" }
                    ]
                });
            }
        } catch (notifError) {
            console.error("Failed to send deposit approval emails:", notifError);
        }

        return { status: true, statusCode: 200, message: "Deposit request approved successfully.", deposit };

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const rejectDepositQuery = async ({ id, adminId, adminNote }) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid deposit id." };
        }

        const deposit = await depositRequestModel.findById(id);

        if (!deposit) {
            return { status: false, statusCode: 404, message: "Deposit request not found." };
        }

        if (deposit.status === "approved") {
            return { status: false, statusCode: 400, message: "Cannot reject an already approved deposit." };
        }

        if (deposit.status === "rejected") {
            return { status: false, statusCode: 400, message: "Deposit request has already been rejected." };
        }

        const updated = await depositRequestModel.findByIdAndUpdate(
            id,
            { $set: { status: "rejected", rejectedBy: adminId, rejectedAt: new Date(), adminNote: adminNote || "" } },
            { new: true }
        );

        // Send notification email
        try {
            let userObj;
            if (deposit.userModel === "Client") {
                userObj = await clientModel.findById(deposit.userId);
            } else if (deposit.userModel === "Agent") {
                userObj = await agentModel.findById(deposit.userId);
            }
            if (userObj) {
                await sendNotificationMail({
                    to: userObj.email,
                    subject: "Deposit Request Declined | Merlion Asset Holdings",
                    title: "Deposit Declined",
                    message: `Your deposit request of ${deposit.amount} ${deposit.currency} has been declined.`,
                    details: [
                        { label: "Transaction ID", value: deposit._id.toString() },
                        { label: "Amount", value: `${deposit.amount} ${deposit.currency}` },
                        { label: "Reason / Note", value: adminNote || "No specific reason provided." },
                        { label: "Status", value: "Declined" }
                    ]
                });
            }
        } catch (notifError) {
            console.error("Failed to send deposit rejection email:", notifError);
        }

        // Sync agent stats if applicable
        try {
            const { syncAgentStats } = require("./agent.query");
            if (deposit.userModel === "Agent") {
                await syncAgentStats(deposit.userId);
            } else if (deposit.userModel === "Client") {
                const client = await clientModel.findById(deposit.userId);
                if (client && client.agent) {
                    await syncAgentStats(client.agent);
                }
            }
        } catch (syncErr) {
            console.error("Failed to sync agent stats after deposit rejection:", syncErr);
        }

        return { status: true, statusCode: 200, message: "Deposit request rejected.", deposit: updated };

    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const bulkApproveDepositsQuery = async ({ ids, adminId }) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { status: false, statusCode: 400, message: "No IDs provided." };
    }

    const approved = [];
    const skipped = [];
    const failed = [];

    for (const id of ids) {
        try {
            const result = await approveDepositQuery({ id, adminId });
            if (result.status) {
                approved.push(id);
            } else {
                skipped.push({ id, reason: result.message });
            }
        } catch (err) {
            failed.push({ id, reason: err.message });
        }
    }

    return {
        status: true,
        statusCode: 200,
        message: `${approved.length} deposit(s) approved. ${skipped.length} skipped. ${failed.length} failed.`,
        results: { approved, skipped, failed }
    };
};


const bulkRejectDepositsQuery = async ({ ids, adminId, adminNote }) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { status: false, statusCode: 400, message: "No IDs provided." };
    }

    const rejected = [];
    const skipped = [];
    const failed = [];

    for (const id of ids) {
        try {
            const result = await rejectDepositQuery({ id, adminId, adminNote });
            if (result.status) {
                rejected.push(id);
            } else {
                skipped.push({ id, reason: result.message });
            }
        } catch (err) {
            failed.push({ id, reason: err.message });
        }
    }

    return {
        status: true,
        statusCode: 200,
        message: `${rejected.length} deposit(s) rejected. ${skipped.length} skipped. ${failed.length} failed.`,
        results: { rejected, skipped, failed }
    };
};


const adminDepositSummaryQuery = async () => {
    try {
        const [result] = await depositRequestModel.aggregate([
            {
                $facet: {
                    byStatus: [
                        { $group: { _id: "$status", count: { $sum: 1 } } }
                    ],
                    byUserModel: [
                        { $group: { _id: "$userModel", count: { $sum: 1 } } }
                    ],
                    approvedVolumeByCurrency: [
                        { $match: { status: "approved" } },
                        {
                            $group: {
                                _id: "$currency",
                                total: { $sum: "$amount" },
                                count: { $sum: 1 }
                            }
                        },
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


const deleteAllDepositsQuery = async () => {
    try {
        const result = await depositRequestModel.deleteMany({});
        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} deposit record(s) deleted.`,
            deletedCount: result.deletedCount
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const deleteDepositsQuery = async (ids) => {
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

        const result = await depositRequestModel.deleteMany({ _id: { $in: objectIds } });

        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} deposit record(s) deleted.`,
            deletedCount: result.deletedCount
        };

    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


module.exports = {
    createDepositRequestQuery,
    userDepositListQuery,
    getUserDepositByIdQuery,
    adminDepositListQuery,
    adminGetDepositByIdQuery,
    adminDepositSummaryQuery,
    approveDepositQuery,
    rejectDepositQuery,
    bulkApproveDepositsQuery,
    bulkRejectDepositsQuery,
    deleteDepositsQuery,
    deleteAllDepositsQuery
};
