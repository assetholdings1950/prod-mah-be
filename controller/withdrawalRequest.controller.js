const {
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
} = require("../query/withdrawalRequest.query");
const WithdrawalRequest = require("../models/withdrawalRequest.model");
const { logActivity }   = require("../utils/activityLogger");
const { ensureAccountOpeningApproved } = require("../query/accountOpeningForm.query");

const createWithdrawalRequestController = async (req, res, next) => {
    try {
        const userModel = req.user.model === "Agent" ? "Agent" : "Client";
        if (userModel === "Client") await ensureAccountOpeningApproved(req.user.sub);
        const response = await createWithdrawalRequestQuery({ ...req.body, userId: req.user.sub, userModel });
        if (response.status && response.withdrawal) {
            const w = response.withdrawal;
            const userModel = req.user.model === "Agent" ? "Agent" : "Client";
            logActivity({
                userId: req.user.sub, userModel,
                action: "withdrawal.created", category: "finance",
                description: `Withdrawal request of ${w.amount} ${w.currency} submitted`,
                metadata: { amount: w.amount, currency: w.currency },
                performedBy: { id: req.user.sub, role: userModel },
                notification: {
                    title: "Withdrawal request submitted",
                    priority: "high",
                    actionRequired: true,
                    entity: {
                        model: "WithdrawalRequest", id: w._id,
                        reference: `WD-${String(w._id).slice(-8).toUpperCase()}`,
                        label: "Withdrawal", url: `/finance/withdrawals/${w._id}`, state: w.status || "pending",
                    },
                    footprints: [
                        { label: "Request created", description: `${w.amount} ${w.currency} withdrawal request submitted` },
                        { label: "Validation passed", description: "Account and withdrawal request validation completed" },
                        { label: "Admin notified", description: "Notification stored for administrator review" },
                    ],
                },
            });
        }
        return res.send(response);
    } catch (error) {
        if (error.status) return res.status(error.status).send({ status: false, statusCode: error.status, message: error.message });
        next(error);
    }
};

const userWithdrawalListController = async (req, res, next) => {
    try {
        const { page, limit, status } = req.query;
        const response = await userWithdrawalListQuery({ userId: req.user.sub, userModel: req.user.model || "Client", page: Number(page) || 1, limit: Number(limit) || 10, status });
        return res.send(response);
    } catch (error) { next(error); }
};

const getUserWithdrawalByIdController = async (req, res, next) => {
    try {
        const response = await getUserWithdrawalByIdQuery({ id: req.params.id, userId: req.user.sub });
        return res.send(response);
    } catch (error) { next(error); }
};

const adminWithdrawalListController = async (req, res, next) => {
    try {
        const { page, limit, search, status, userModel, userId } = req.query;
        const response = await adminWithdrawalListQuery({ page: Number(page) || 1, limit: Number(limit) || 10, search, status, userModel, userId });
        return res.send(response);
    } catch (error) { next(error); }
};

const adminGetWithdrawalByIdController = async (req, res, next) => {
    try {
        const response = await adminGetWithdrawalByIdQuery(req.params.id);
        return res.send(response);
    } catch (error) { next(error); }
};

const withdrawalSummaryController = async (req, res, next) => {
    try {
        const response = await withdrawalSummaryQuery();
        return res.send(response);
    } catch (error) { next(error); }
};

const approveWithdrawalController = async (req, res, next) => {
    try {
        const withdrawal = await WithdrawalRequest.findById(req.params.id).select("userId userModel amount currency").lean();
        const response   = await approveWithdrawalQuery({ id: req.params.id, adminId: req.user.sub });
        if (withdrawal && response.status && ["Client", "Agent"].includes(withdrawal.userModel)) {
            logActivity({
                userId: withdrawal.userId, userModel: withdrawal.userModel,
                action: "withdrawal.approved", category: "finance",
                description: `Withdrawal of ${withdrawal.amount} ${withdrawal.currency} approved`,
                metadata: { amount: withdrawal.amount, currency: withdrawal.currency },
                performedBy: { id: req.user.sub, role: "admin" },
                notification: { actionRequired: false, entity: { model: "WithdrawalRequest", id: req.params.id, reference: `WD-${String(req.params.id).slice(-8).toUpperCase()}`, label: "Withdrawal", url: `/finance/withdrawals/${req.params.id}`, state: "approved" } },
            });
        }
        return res.send(response);
    } catch (error) { next(error); }
};

const rejectWithdrawalController = async (req, res, next) => {
    try {
        const withdrawal = await WithdrawalRequest.findById(req.params.id).select("userId userModel amount currency").lean();
        const response   = await rejectWithdrawalQuery({ id: req.params.id, adminId: req.user.sub, adminNote: req.body?.adminNote });
        if (withdrawal && response.status && ["Client", "Agent"].includes(withdrawal.userModel)) {
            logActivity({
                userId: withdrawal.userId, userModel: withdrawal.userModel,
                action: "withdrawal.rejected", category: "finance",
                description: `Withdrawal of ${withdrawal.amount} ${withdrawal.currency} rejected`,
                metadata: { amount: withdrawal.amount, currency: withdrawal.currency, note: req.body?.adminNote },
                performedBy: { id: req.user.sub, role: "admin" },
                notification: { priority: "high", actionRequired: false, entity: { model: "WithdrawalRequest", id: req.params.id, reference: `WD-${String(req.params.id).slice(-8).toUpperCase()}`, label: "Withdrawal", url: `/finance/withdrawals/${req.params.id}`, state: "rejected" } },
            });
        }
        return res.send(response);
    } catch (error) { next(error); }
};

const bulkApproveWithdrawalsController = async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).send({ status: false, message: "ids array is required." });
        const response = await bulkApproveWithdrawalsQuery({ ids, adminId: req.user.sub });
        return res.send(response);
    } catch (error) { next(error); }
};

const bulkRejectWithdrawalsController = async (req, res, next) => {
    try {
        const { ids, adminNote } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).send({ status: false, message: "ids array is required." });
        const response = await bulkRejectWithdrawalsQuery({ ids, adminId: req.user.sub, adminNote });
        return res.send(response);
    } catch (error) { next(error); }
};

const deleteAllWithdrawalsController = async (req, res, next) => {
    try {
        const response = await deleteAllWithdrawalsQuery();
        return res.send(response);
    } catch (error) { next(error); }
};

const deleteWithdrawalsController = async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).send({ status: false, message: "ids array is required." });
        const response = await deleteWithdrawalsQuery(ids);
        return res.send(response);
    } catch (error) { next(error); }
};

module.exports = {
    createWithdrawalRequestController,
    userWithdrawalListController,
    getUserWithdrawalByIdController,
    adminWithdrawalListController,
    adminGetWithdrawalByIdController,
    withdrawalSummaryController,
    approveWithdrawalController,
    rejectWithdrawalController,
    bulkApproveWithdrawalsController,
    bulkRejectWithdrawalsController,
    deleteWithdrawalsController,
    deleteAllWithdrawalsController,
};
