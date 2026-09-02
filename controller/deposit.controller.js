const {
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
} = require("../query/deposit.query");
const DepositRequest    = require("../models/depositRequest.model");
const { logActivity }   = require("../utils/activityLogger");

const createDepositRequestController = async (req, res, next) => {
    try {
        const response = await createDepositRequestQuery({
            ...req.body,
            userId: req.user.sub,
            userModel: req.user.model,
        });
        if (response.status && response.depositRequest) {
            const d = response.depositRequest;
            if (["Client", "Agent"].includes(d.userModel)) {
                logActivity({
                    userId: d.userId, userModel: d.userModel,
                    action: "deposit.created", category: "finance",
                    description: `Deposit request of ${d.amount} ${d.currency} submitted`,
                    metadata: { amount: d.amount, currency: d.currency },
                    performedBy: { id: req.user.sub, role: req.user.model ?? "Client" },
                    notification: {
                        title: "New deposit awaiting verification",
                        priority: "medium",
                        actionRequired: true,
                        entity: {
                            model: "DepositRequest", id: d._id,
                            reference: `DP-${String(d._id).slice(-8).toUpperCase()}`,
                            label: "Deposit", url: `/finance/deposits/${d._id}`, state: d.status || "pending",
                        },
                        footprints: [
                            { label: "Deposit submitted", description: `${d.amount} ${d.currency} deposit request created` },
                            { label: "Awaiting verification", description: "Payment proof is ready for administrator review" },
                            { label: "Admin notified", description: "Notification stored for administrator review" },
                        ],
                    },
                });
            }
        }
        return res.status(response.statusCode || 200).send(response);
    } catch (error) {
        next(error);
    }
};

const userDepositListController = async (req, res, next) => {
    try {
        const { page, limit, status } = req.query;
        const response = await userDepositListQuery({ userId: req.user.sub, page: Number(page) || 1, limit: Number(limit) || 10, status });
        return res.send(response);
    } catch (error) { next(error); }
};

const getUserDepositByIdController = async (req, res, next) => {
    try {
        const response = await getUserDepositByIdQuery({ id: req.params.id, userId: req.user.sub });
        return res.send(response);
    } catch (error) { next(error); }
};

const adminDepositSummaryController = async (req, res, next) => {
    try {
        const response = await adminDepositSummaryQuery();
        return res.send(response);
    } catch (error) { next(error); }
};

const adminDepositListController = async (req, res, next) => {
    try {
        const { page, limit, search, status, currency, userModel, userId, paymentMethodId, startDate, endDate } = req.query;
        const response = await adminDepositListQuery({ page: Number(page) || 1, limit: Number(limit) || 10, search, status, currency, userModel, userId, paymentMethodId, startDate, endDate });
        return res.send(response);
    } catch (error) { next(error); }
};

const adminGetDepositByIdController = async (req, res, next) => {
    try {
        const response = await adminGetDepositByIdQuery(req.params.id);
        return res.send(response);
    } catch (error) { next(error); }
};

const approveDepositController = async (req, res, next) => {
    try {
        const deposit  = await DepositRequest.findById(req.params.id).select("userId userModel amount currency").lean();
        const response = await approveDepositQuery({ id: req.params.id, adminId: req.user.sub });
        if (deposit && response.status && ["Client", "Agent"].includes(deposit.userModel)) {
            logActivity({
                userId: deposit.userId, userModel: deposit.userModel,
                action: "deposit.approved", category: "finance",
                description: `Deposit of ${deposit.amount} ${deposit.currency} approved`,
                metadata: { amount: deposit.amount, currency: deposit.currency },
                performedBy: { id: req.user.sub, role: "admin" },
                notification: { actionRequired: false, entity: { model: "DepositRequest", id: req.params.id, reference: `DP-${String(req.params.id).slice(-8).toUpperCase()}`, label: "Deposit", url: `/finance/deposits/${req.params.id}`, state: "approved" } },
            });
        }
        return res.send(response);
    } catch (error) { next(error); }
};

const rejectDepositController = async (req, res, next) => {
    try {
        const deposit  = await DepositRequest.findById(req.params.id).select("userId userModel amount currency").lean();
        const response = await rejectDepositQuery({ id: req.params.id, adminId: req.user.sub, adminNote: req.body?.adminNote });
        if (deposit && response.status && ["Client", "Agent"].includes(deposit.userModel)) {
            logActivity({
                userId: deposit.userId, userModel: deposit.userModel,
                action: "deposit.rejected", category: "finance",
                description: `Deposit of ${deposit.amount} ${deposit.currency} rejected`,
                metadata: { amount: deposit.amount, currency: deposit.currency, note: req.body?.adminNote },
                performedBy: { id: req.user.sub, role: "admin" },
                notification: { priority: "high", actionRequired: false, entity: { model: "DepositRequest", id: req.params.id, reference: `DP-${String(req.params.id).slice(-8).toUpperCase()}`, label: "Deposit", url: `/finance/deposits/${req.params.id}`, state: "rejected" } },
            });
        }
        return res.send(response);
    } catch (error) { next(error); }
};

const bulkApproveDepositsController = async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).send({ status: false, message: "ids array is required." });
        const response = await bulkApproveDepositsQuery({ ids, adminId: req.user.sub });
        return res.send(response);
    } catch (error) { next(error); }
};

const bulkRejectDepositsController = async (req, res, next) => {
    try {
        const { ids, adminNote } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).send({ status: false, message: "ids array is required." });
        const response = await bulkRejectDepositsQuery({ ids, adminId: req.user.sub, adminNote });
        return res.send(response);
    } catch (error) { next(error); }
};

const deleteAllDepositsController = async (req, res, next) => {
    try {
        const response = await deleteAllDepositsQuery();
        return res.send(response);
    } catch (error) { next(error); }
};

const deleteDepositsController = async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).send({ status: false, message: "ids array is required." });
        const response = await deleteDepositsQuery(ids);
        return res.send(response);
    } catch (error) { next(error); }
};

module.exports = {
    createDepositRequestController,
    userDepositListController,
    getUserDepositByIdController,
    adminDepositListController,
    adminGetDepositByIdController,
    adminDepositSummaryController,
    approveDepositController,
    rejectDepositController,
    bulkApproveDepositsController,
    bulkRejectDepositsController,
    deleteDepositsController,
    deleteAllDepositsController
};
