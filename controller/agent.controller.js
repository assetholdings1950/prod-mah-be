const agentModel = require("../models/agent.model");
const mongoose = require("mongoose");
const Transaction = require("../models/transaction.model");
const UserWallet = require("../models/userWallet.model");
const { getAgentSourceBalance } = require("../query/withdrawalRequest.query");
const {
    authQuery,
    signUpQuery,
    createAgentByAdminQuery,
    createReferralAgentByAgentQuery,
    getReferredAgentsQuery,
    verifyOtpQuery,
    resendOtpQuery,
    forgotPasswordQuery,
    submitKycQuery,
    approveKycQuery,
    agentListQuery,
    editAgentQuery,
    deleteAgentQuery,
    getAgentByIdQuery,
    updateAgentProfileQuery
} = require("../query/agent.query");
const { verifyRefreshToken, signAccessToken } = require("../services/jwt.service");
const { logActivity } = require("../utils/activityLogger");

const authController = async (req, res, next) => {
    try {
        const response = await authQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const signUpController = async (req, res, next) => {
    try {
        const response = await signUpQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const createAgentByAdminController = async (req, res, next) => {
    try {
        const response = await createAgentByAdminQuery({
            ...req.body,
            createdBy: req.user.sub
        });

        if (response.status && response.agent?._id) {
            const currentRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
            const roleName = typeof currentRole === "string"
                ? currentRole
                : currentRole?.roleName || currentRole?.roleCode || "admin";

            logActivity({
                userId: response.agent._id,
                userModel: "Agent",
                action: "account.created",
                category: "account",
                description: "Agent account created from the admin panel",
                performedBy: { id: req.user.sub, role: roleName },
                metadata: { agentId: response.agent.agentId }
            });
        }

        return res.status(response.statusCode || 500).send(response);
    } catch (error) {
        next(error);
    }
};

/** An authenticated agent creates a downline agent under their own referral. */
const createReferralAgentByAgentController = async (req, res, next) => {
    try {
        const referrerAgentId = req.user.sub;
        const response = await createReferralAgentByAgentQuery(req.body, referrerAgentId);

        if (response.status && response.agent?._id) {
            logActivity({
                userId: response.agent._id,
                userModel: "Agent",
                action: "account.created",
                category: "account",
                description: "Agent account created via agent referral",
                performedBy: { id: referrerAgentId, role: "Agent" },
                metadata: { agentId: response.agent.agentId, sponsorAgent: referrerAgentId }
            });
        }

        return res.status(response.statusCode || 500).send(response);
    } catch (error) {
        next(error);
    }
};

/** List the agents the authenticated agent has personally referred. */
const getMyReferredAgentsController = async (req, res, next) => {
    try {
        const { page, limit, search } = req.query;
        const response = await getReferredAgentsQuery(req.user.sub, {
            page: Number(page) || 1,
            limit: Number(limit) || 20,
            search: search || ""
        });
        return res.status(response.statusCode || 500).send(response);
    } catch (error) {
        next(error);
    }
};

// Commission records are immutable ledger entries created when a managed
// client's investment becomes completed. An agent may only read their own.
const getMyCommissionTransactionsController = async (req, res, next) => {
    try {
        const agentId = new mongoose.Types.ObjectId(req.user.sub);
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
        const status = String(req.query.status || "all").toLowerCase();
        const search = String(req.query.search || "").trim();
        const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
        const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;

        const match = {
            userId: agentId,
            userModel: "Agent",
            type: "earning",
            currency: "USD",
        };
        if (["completed", "pending", "failed"].includes(status)) match.status = status;
        if (dateFrom && !Number.isNaN(dateFrom.getTime())) match.createdAt = { $gte: dateFrom };
        if (dateTo && !Number.isNaN(dateTo.getTime())) {
            dateTo.setUTCHours(23, 59, 59, 999);
            match.createdAt = { ...(match.createdAt || {}), $lte: dateTo };
        }

        const stages = [
            { $match: match },
            {
                $lookup: {
                    from: "clients",
                    localField: "metadata.clientId",
                    foreignField: "_id",
                    as: "client",
                },
            },
            {
                $lookup: {
                    from: "transactions",
                    localField: "referenceId",
                    foreignField: "_id",
                    as: "investment",
                },
            },
        ];

        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const expression = new RegExp(escaped, "i");
            stages.push({
                $match: {
                    $or: [
                        { description: expression },
                        { "client.firstName": expression },
                        { "client.lastName": expression },
                        { "client.fullName": expression },
                        { "client.email": expression },
                    ],
                },
            });
        }

        const [result] = await Transaction.aggregate([
            ...stages,
            {
                $facet: {
                    docs: [
                        { $sort: { createdAt: -1, _id: -1 } },
                        { $skip: (page - 1) * limit },
                        { $limit: limit },
                    ],
                    totals: [
                        {
                            $group: {
                                _id: null,
                                credited: {
                                    $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$amount", 0] },
                                },
                                pending: {
                                    $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] },
                                },
                                records: { $sum: 1 },
                            },
                        },
                    ],
                },
            },
        ]);

        const docs = (result?.docs || []).map((record) => {
            const client = record.client?.[0] || null;
            const investment = record.investment?.[0] || null;
            return {
                _id: record._id,
                amount: record.amount,
                currency: record.currency,
                status: record.status,
                description: record.description,
                metadata: record.metadata || {},
                referenceId: record.referenceId,
                createdAt: record.createdAt,
                client: client && {
                    _id: client._id,
                    firstName: client.firstName,
                    lastName: client.lastName,
                    fullName: client.fullName,
                    email: client.email,
                },
                investment: investment && {
                    _id: investment._id,
                    amount: investment.amount,
                    currency: investment.currency,
                    usdAmount: investment.usdAmount,
                    createdAt: investment.createdAt,
                },
            };
        });
        const totals = result?.totals?.[0] || { credited: 0, pending: 0, records: 0 };
        return res.status(200).json({
            status: true,
            data: {
                docs,
                page,
                limit,
                totalDocs: totals.records || 0,
                totalPages: Math.max(1, Math.ceil((totals.records || 0) / limit)),
                totals: { credited: totals.credited || 0, pending: totals.pending || 0 },
            },
        });
    } catch (error) {
        next(error);
    }
};

// Salary is deliberately a distinct ledger type: it credits an agent's USD
// wallet but is never included in commission earnings or commission payouts.
const creditAgentSalaryController = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        const agentId = req.params.agentId;
        const amount = Number(req.body?.amount);
        const note = String(req.body?.note || "").trim();
        const payrollReference = String(req.body?.payrollReference || "").trim();
        if (!mongoose.isValidObjectId(agentId)) {
            return res.status(400).json({ status: false, message: "A valid agent is required." });
        }
        if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
            return res.status(400).json({ status: false, message: "Salary amount must be greater than zero." });
        }
        if (note.length > 500 || payrollReference.length > 100) {
            return res.status(400).json({ status: false, message: "Salary note or payroll reference is too long." });
        }

        let salaryTransaction;
        await session.withTransaction(async () => {
            const agent = await agentModel.findById(agentId).select("_id status").session(session);
            if (!agent) throw Object.assign(new Error("Agent not found."), { statusCode: 404 });
            if (["closed", "blocked"].includes(agent.status)) {
                throw Object.assign(new Error("Salary cannot be credited to this agent."), { statusCode: 400 });
            }

            [salaryTransaction] = await Transaction.create([{
                userId: agent._id,
                userModel: "Agent",
                type: "salary",
                amount: Number(amount.toFixed(2)),
                currency: "USD",
                usdAmount: Number(amount.toFixed(2)),
                status: "completed",
                description: note || "Manual salary credit by administration.",
                metadata: {
                    source: "admin_manual_salary",
                    payrollReference: payrollReference || null,
                    creditedBy: req.user.sub,
                },
                createdBy: req.user.sub,
            }], { session });

            await UserWallet.findOneAndUpdate(
                { userId: agent._id, userModel: "Agent", currency: "USD" },
                { $inc: { balance: Number(amount.toFixed(2)), totalDeposited: Number(amount.toFixed(2)) } },
                { upsert: true, new: true, session },
            );
        });

        logActivity({
            userId: agentId, userModel: "Agent", action: "salary.credited", category: "finance",
            description: `USD ${Number(amount).toFixed(2)} salary credited by administration`,
            performedBy: { id: req.user.sub, role: "Admin" },
            metadata: { transactionId: salaryTransaction._id, amount: salaryTransaction.amount, currency: "USD", payrollReference: payrollReference || null },
        });
        return res.status(201).json({ status: true, message: "Salary credited successfully.", transaction: salaryTransaction });
    } catch (error) {
        next(error);
    } finally {
        session.endSession();
    }
};

const getAgentSalaryPaymentsController = async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.agentId)) {
            return res.status(400).json({ status: false, message: "A valid agent is required." });
        }
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
        const result = await Transaction.paginate(
            { userId: req.params.agentId, userModel: "Agent", type: "salary", currency: "USD" },
            { page, limit, sort: { createdAt: -1 }, populate: { path: "createdBy", select: "firstName lastName fullName email" } },
        );
        return res.status(200).json({ status: true, data: result });
    } catch (error) {
        next(error);
    }
};

const getMySalaryBalanceController = async (req, res, next) => {
    try {
        const balance = await getAgentSourceBalance(req.user.sub, "salary");
        return res.status(200).json({ status: true, data: { availableSalaryBalance: balance } });
    } catch (error) { next(error); }
};

const verifyOtpController = async (req, res, next) => {
    try {
        const response = await verifyOtpQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const resendOtpController = async (req, res, next) => {
    try {
        const response = await resendOtpQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const forgotPasswordController = async (req, res, next) => {
    try {
        const response = await forgotPasswordQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const refreshController = async (req, res, next) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({ status: false, message: "Refresh token required" });
    }

    try {
        const payload = verifyRefreshToken(refreshToken);
        const agent = await agentModel.findById(payload.sub);

        if (!agent || agent.refreshToken !== refreshToken) {
            return res.status(403).json({ status: false, message: "Invalid refresh token" });
        }

        const newAccessToken = signAccessToken({
            sub: agent._id,
            role: ["Agent"],
            email: agent.email,
        });

        return res.json({
            status: true,
            accessToken: newAccessToken,
        });
    } catch (err) {
        return res.status(403).json({ status: false, message: "Invalid or expired refresh token" });
    }
};

const logoutController = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ status: false, message: "Refresh token required" });
    }

    const agent = await agentModel.findOne({ refreshToken });
    if (!agent) {
        return res.status(200).json({ status: true, message: "Logged out" });
    }

    agent.refreshToken = null;
    await agent.save();

    return res.json({ status: true, message: "Logged out successfully" });
};

const submitKycController = async (req, res, next) => {
    try {
        const userId = req.user.sub;
        const response = await submitKycQuery(userId, req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const approveKycController = async (req, res, next) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).send({
                status: false,
                statusCode: 400,
                message: "Agent userId is required for KYC approval."
            });
        }
        const response = await approveKycQuery(userId);
        if (response.status) {
            logActivity({
                userId, userModel: "Agent",
                action: "kyc.approved", category: "kyc",
                description: "KYC approved by admin",
                performedBy: { id: req.user?.sub, role: "admin" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const agentListController = async (req, res, next) => {
    try {
        const { page, limit, search, status, kycStatus, agentLevel, country, preferredCurrency } = req.query;
        const response = await agentListQuery({
            page: Number(page) || 1,
            limit: Number(limit) || 10,
            search: search || "",
            status,
            kycStatus,
            agentLevel,
            country,
            preferredCurrency
        });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const editAgentController = async (req, res, next) => {
    try {
        const response = await editAgentQuery(req.body);
        if (response.status && req.body._id) {
            logActivity({
                userId: req.body._id, userModel: "Agent",
                action: "profile.updated", category: "profile",
                description: "Profile updated",
                performedBy: { id: req.user?.sub, role: req.user?.role?.[0] ?? "admin" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const deleteAgentController = async (req, res, next) => {
    try {
        const response = await deleteAgentQuery(req.query.ids);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const getAgentByIdController = async (req, res, next) => {
    try {
        const response = await getAgentByIdQuery(req.params.id);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const getAgentProfileController = async (req, res, next) => {
    try {
        const response = await getAgentByIdQuery(req.user.sub);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const updateAgentProfileController = async (req, res, next) => {
    try {
        const agentId = req.user.sub;
        const response = await updateAgentProfileQuery(agentId, req.body);
        if (response.status) {
            logActivity({
                userId: agentId, userModel: "Agent",
                action: "profile.self_updated", category: "profile",
                description: "Agent updated their own profile",
                performedBy: { id: agentId, role: "Agent" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    authController,
    signUpController,
    createAgentByAdminController,
    createReferralAgentByAgentController,
    getMyReferredAgentsController,
    getMyCommissionTransactionsController,
    creditAgentSalaryController,
    getAgentSalaryPaymentsController,
    getMySalaryBalanceController,
    verifyOtpController,
    resendOtpController,
    forgotPasswordController,
    refreshController,
    logoutController,
    submitKycController,
    approveKycController,
    agentListController,
    editAgentController,
    deleteAgentController,
    getAgentByIdController,
    getAgentProfileController,
    updateAgentProfileController
};
