const {
    getWalletsByUserIdQuery,
    addWalletQuery,
    updateWalletQuery,
    deleteWalletQuery,
} = require("../query/walletDetail.query");
const WalletDetail    = require("../models/walletDetail.model");
const { logActivity } = require("../utils/activityLogger");

const getWalletsByUserIdController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userModel = req.userModel || "Client";
        const response = await getWalletsByUserIdQuery({ userId: id, userModel });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const addWalletController = async (req, res, next) => {
    try {
        const userModel = req.userModel || "Client";
        const response = await addWalletQuery({ ...req.body, userModel });
        if (response.status && req.body.userId && ["Client", "Agent"].includes(userModel)) {
            logActivity({
                userId: req.body.userId, userModel,
                action: "wallet.added", category: "profile",
                description: `Withdrawal wallet added${req.body.network ? ` (${req.body.network})` : ""}`,
                metadata: { network: req.body.network, currency: req.body.currency, walletAddress: req.body.walletAddress },
                performedBy: { id: req.user?.sub, role: req.user?.role?.[0] ?? "Client" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const updateWalletController = async (req, res, next) => {
    try {
        const response = await updateWalletQuery(req.body);
        if (response.status && req.body.userId) {
            const userModel = req.body.userModel || req.userModel || "Client";
            if (["Client", "Agent"].includes(userModel)) {
                logActivity({
                    userId: req.body.userId, userModel,
                    action: "wallet.updated", category: "profile",
                    description: `Withdrawal wallet updated${req.body.network ? ` (${req.body.network})` : ""}`,
                    metadata: { network: req.body.network, currency: req.body.currency },
                    performedBy: { id: req.user?.sub, role: req.user?.role?.[0] ?? "admin" },
                });
            }
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const deleteWalletController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const record = await WalletDetail.findById(id).select("userId userModel network currency").lean();
        const response = await deleteWalletQuery(id);
        if (response.status && record && ["Client", "Agent"].includes(record.userModel)) {
            logActivity({
                userId: record.userId, userModel: record.userModel,
                action: "wallet.deleted", category: "profile",
                description: `Withdrawal wallet removed${record.network ? ` (${record.network})` : ""}`,
                metadata: { network: record.network, currency: record.currency },
                performedBy: { id: req.user?.sub, role: req.user?.role?.[0] ?? "admin" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getWalletsByUserIdController,
    addWalletController,
    updateWalletController,
    deleteWalletController,
};
