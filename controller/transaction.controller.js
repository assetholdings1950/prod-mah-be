const {
    adminTransactionListQuery,
    adminTransactionSummaryQuery,
    adminUserWalletQuery,
    getUserWalletBalancesQuery,
    clientTransactionListQuery,
    deleteAllTransactionsQuery,
    deleteUserTransactionsQuery,
    resetFundBalancesQuery,
} = require("../query/transaction.query");


const adminTransactionListController = async (req, res, next) => {
    try {
        const {
            page, limit, search, type, status, userModel,
            userId, currency, startDate, endDate, sortBy, sortOrder
        } = req.query;

        const response = await adminTransactionListQuery({
            page: Number(page) || 1,
            limit: Number(limit) || 15,
            search,
            type,
            status,
            userModel,
            userId,
            currency,
            startDate,
            endDate,
            sortBy,
            sortOrder,
        });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const adminTransactionSummaryController = async (req, res, next) => {
    try {
        const response = await adminTransactionSummaryQuery();
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const adminUserWalletController = async (req, res, next) => {
    try {
        const { userId, userModel } = req.query;
        const response = await adminUserWalletQuery({ userId, userModel: userModel ?? "Client" });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const getUserWalletBalancesController = async (req, res, next) => {
    try {
        const { userId, userModel } = req.query;
        const response = await getUserWalletBalancesQuery({ userId, userModel: userModel ?? "Client" });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const clientTransactionListController = async (req, res, next) => {
    try {
        const {
            clientId, page, limit, search, type, status,
            currency, startDate, endDate, sortBy, sortOrder
        } = req.query;

        const response = await clientTransactionListQuery({
            clientId,
            page: Number(page) || 1,
            limit: Number(limit) || 15,
            search,
            type,
            status,
            currency,
            startDate,
            endDate,
            sortBy,
            sortOrder,
        });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const deleteUserTransactionsController = async (req, res, next) => {
    try {
        const { userId, userModel } = req.query;
        if (!userId) {
            return res.status(400).send({ status: false, message: "userId is required." });
        }
        const response = await deleteUserTransactionsQuery({ userId, userModel });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const resetFundBalancesController = async (req, res, next) => {
    try {
        const { userId, userModel } = req.body;
        if (!userId) {
            return res.status(400).send({ status: false, message: "userId is required." });
        }
        const response = await resetFundBalancesQuery({ userId, userModel });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const deleteAllTransactionsController = async (req, res, next) => {
    try {
        const response = await deleteAllTransactionsQuery();
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


module.exports = {
    adminTransactionListController,
    adminTransactionSummaryController,
    adminUserWalletController,
    getUserWalletBalancesController,
    clientTransactionListController,
    deleteAllTransactionsController,
    deleteUserTransactionsController,
    resetFundBalancesController,
};
