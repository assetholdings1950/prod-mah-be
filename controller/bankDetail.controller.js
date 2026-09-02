const {
    getBankDetailsByUserIdQuery,
    addBankDetailQuery,
    updateBankDetailQuery,
    deleteBankDetailQuery,
} = require("../query/bankDetail.query");
const BankDetail      = require("../models/bankDetail.model");
const { logActivity } = require("../utils/activityLogger");

const getBankDetailsByUserIdController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userModel = req.userModel || "Client";
        const response = await getBankDetailsByUserIdQuery({ userId: id, userModel });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const addBankDetailController = async (req, res, next) => {
    try {
        const userModel = req.userModel || "Client";
        const response = await addBankDetailQuery({ ...req.body, userModel });
        if (response.status && req.body.userId && ["Client", "Agent"].includes(userModel)) {
            logActivity({
                userId: req.body.userId, userModel,
                action: "bank_detail.added", category: "profile",
                description: `Bank account added${req.body.bankName ? ` (${req.body.bankName})` : ""}`,
                metadata: { bankName: req.body.bankName, accountHolderName: req.body.accountHolderName },
                performedBy: { id: req.user?.sub, role: req.user?.role?.[0] ?? "Client" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const updateBankDetailController = async (req, res, next) => {
    try {
        const response = await updateBankDetailQuery(req.body);
        if (response.status && req.body.userId) {
            const userModel = req.body.userModel || req.userModel || "Client";
            if (["Client", "Agent"].includes(userModel)) {
                logActivity({
                    userId: req.body.userId, userModel,
                    action: "bank_detail.updated", category: "profile",
                    description: `Bank account updated${req.body.bankName ? ` (${req.body.bankName})` : ""}`,
                    metadata: { bankName: req.body.bankName, accountHolderName: req.body.accountHolderName },
                    performedBy: { id: req.user?.sub, role: req.user?.role?.[0] ?? "admin" },
                });
            }
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const deleteBankDetailController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const record = await BankDetail.findById(id).select("userId userModel bankName").lean();
        const response = await deleteBankDetailQuery(id);
        if (response.status && record && ["Client", "Agent"].includes(record.userModel)) {
            logActivity({
                userId: record.userId, userModel: record.userModel,
                action: "bank_detail.deleted", category: "profile",
                description: `Bank account removed${record.bankName ? ` (${record.bankName})` : ""}`,
                metadata: { bankName: record.bankName },
                performedBy: { id: req.user?.sub, role: req.user?.role?.[0] ?? "admin" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getBankDetailsByUserIdController,
    addBankDetailController,
    updateBankDetailController,
    deleteBankDetailController,
};
