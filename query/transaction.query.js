const mongoose = require("mongoose");
const transactionModel = require("../models/transaction.model");
const userWalletModel = require("../models/userWallet.model");

const userProjection = { firstName: 1, lastName: 1, fullName: 1, email: 1, clientId: 1, agentId: 1 };

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


const adminTransactionListQuery = async ({
    page = 1,
    limit = 15,
    search,
    type,
    status,
    userModel,
    userId,
    currency,
    startDate,
    endDate,
    sortBy = "createdAt",
    sortOrder = "desc"
}) => {
    try {
        // Pre-lookup filters on indexed fields
        const matchQuery = {};
        if (type) matchQuery.type = type;
        if (status) matchQuery.status = status;
        if (userModel) matchQuery.userModel = userModel;
        if (currency) matchQuery.currency = currency;
        if (userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
            matchQuery.userId = mongoose.Types.ObjectId.createFromHexString(userId);
        }
        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchQuery.createdAt.$lte = end;
            }
        }

        // Post-lookup search on populated user fields
        let searchStage = null;
        if (search && search.trim()) {
            const regex = { $regex: search.trim(), $options: "i" };
            const orConditions = [
                { "userId.firstName": regex },
                { "userId.lastName": regex },
                { "userId.fullName": regex },
                { "userId.email": regex },
                { description: regex },
            ];
            const numericAmount = parseFloat(search.trim());
            if (!isNaN(numericAmount)) {
                orConditions.push({ amount: numericAmount });
            }
            searchStage = { $match: { $or: orConditions } };
        }

        const allowedSortFields = { createdAt: 1, amount: 1 };
        const sortField = allowedSortFields[sortBy] ? sortBy : "createdAt";
        const sortDir = sortOrder === "asc" ? 1 : -1;

        const aggregate = transactionModel.aggregate([
            { $match: matchQuery },
            ...ownerLookupStages,
            ...(searchStage ? [searchStage] : []),
            {
                $lookup: {
                    from: "users",
                    let: { createdById: "$createdBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$createdById"] } } },
                        { $project: { fullName: 1, firstName: 1, lastName: 1, email: 1 } }
                    ],
                    as: "_createdByUser"
                }
            },
            {
                $addFields: {
                    createdBy: {
                        $cond: {
                            if: { $gt: [{ $size: "$_createdByUser" }, 0] },
                            then: { $arrayElemAt: ["$_createdByUser", 0] },
                            else: "$createdBy"
                        }
                    }
                }
            },
            { $project: { _createdByUser: 0 } },
            { $sort: { [sortField]: sortDir } }
        ]);

        const transactions = await transactionModel.aggregatePaginate(aggregate, { page, limit });
        return { status: true, statusCode: 200, transactions };

    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const adminTransactionSummaryQuery = async () => {
    try {
        const [result] = await transactionModel.aggregate([
            {
                $facet: {
                    byType: [
                        { $group: { _id: "$type", count: { $sum: 1 } } }
                    ],
                    byStatus: [
                        { $group: { _id: "$status", count: { $sum: 1 } } }
                    ],
                    completedVolume: [
                        { $match: { status: "completed" } },
                        { $group: { _id: null, total: { $sum: "$amount" } } }
                    ],
                    volumeByCurrency: [
                        { $match: { status: "completed" } },
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

        const typeMap = {};
        for (const t of (result?.byType ?? [])) typeMap[t._id] = t.count;

        const statusMap = {};
        for (const s of (result?.byStatus ?? [])) statusMap[s._id] = s.count;

        const volumeByCurrency = {};
        for (const v of (result?.volumeByCurrency ?? [])) {
            volumeByCurrency[v._id] = { total: v.total, count: v.count };
        }

        return {
            status: true,
            statusCode: 200,
            summary: {
                totalCount: Object.values(statusMap).reduce((a, b) => a + b, 0),
                completedCount: statusMap.completed ?? 0,
                pendingCount: statusMap.pending ?? 0,
                failedCount: statusMap.failed ?? 0,
                depositCount: typeMap.deposit ?? 0,
                withdrawalCount: typeMap.withdrawal ?? 0,
                investmentCount: typeMap.investment ?? 0,
                earningCount: typeMap.earning ?? 0,
                completedVolume: result?.completedVolume?.[0]?.total ?? 0,
                volumeByCurrency,
            }
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const adminUserWalletQuery = async ({ userId, userModel }) => {
    try {
        const matchQuery = { userModel };
        if (userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
            matchQuery.userId = mongoose.Types.ObjectId.createFromHexString(userId);
        } else {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }

        const rows = await transactionModel.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: {
                        currency: "$currency",
                        type: "$type",
                        status: "$status"
                    },
                    total: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            }
        ]);

        const currencyMap = {};
        for (const row of rows) {
            const { currency, type, status } = row._id;
            if (!currencyMap[currency]) {
                currencyMap[currency] = {
                    currency,
                    netBalance: 0,
                    totalIn: 0,
                    totalOut: 0,
                    depositTotal: 0,
                    earningTotal: 0,
                    withdrawalTotal: 0,
                    investmentTotal: 0,
                    totalCount: 0,
                    completedCount: 0,
                };
            }
            currencyMap[currency].totalCount += row.count;
            if (status === "completed") {
                currencyMap[currency].completedCount += row.count;
                if (type === "deposit") {
                    currencyMap[currency].depositTotal += row.total;
                    currencyMap[currency].totalIn += row.total;
                } else if (type === "earning") {
                    currencyMap[currency].earningTotal += row.total;
                    currencyMap[currency].totalIn += row.total;
                } else if (type === "withdrawal") {
                    currencyMap[currency].withdrawalTotal += row.total;
                    currencyMap[currency].totalOut += row.total;
                } else if (type === "investment") {
                    currencyMap[currency].investmentTotal += row.total;
                    currencyMap[currency].totalOut += row.total;
                }
            }
        }

        for (const c of Object.values(currencyMap)) {
            c.netBalance = c.totalIn - c.totalOut;
        }

        const balances = Object.values(currencyMap).sort((a, b) => b.totalIn - a.totalIn);
        return { status: true, statusCode: 200, balances };

    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const getUserWalletBalancesQuery = async ({ userId, userModel }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }

        if (!["User", "Agent", "Client"].includes(userModel)) {
            return { status: false, statusCode: 400, message: "userModel must be User, Agent, or Client." };
        }

        const wallets = await userWalletModel
            .find({ userId: mongoose.Types.ObjectId.createFromHexString(userId), userModel })
            .sort({ currency: 1 })
            .lean();

        return { status: true, statusCode: 200, wallets };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const clientTransactionListQuery = async ({
    clientId,
    page = 1,
    limit = 15,
    search,
    type,
    status,
    currency,
    startDate,
    endDate,
    sortBy = "createdAt",
    sortOrder = "desc"
}) => {
    try {
        if (!clientId || !clientId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid clientId." };
        }

        const matchQuery = {
            userId: mongoose.Types.ObjectId.createFromHexString(clientId),
            userModel: "Client",
        };

        if (type) matchQuery.type = type;
        if (status) matchQuery.status = status;
        if (currency) matchQuery.currency = currency;
        if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchQuery.createdAt.$lte = end;
            }
        }

        let searchStage = null;
        if (search && search.trim()) {
            const regex = { $regex: search.trim(), $options: "i" };
            const orConditions = [
                { "userId.firstName": regex },
                { "userId.lastName": regex },
                { "userId.fullName": regex },
                { "userId.email": regex },
                { description: regex },
            ];
            const numericAmount = parseFloat(search.trim());
            if (!isNaN(numericAmount)) {
                orConditions.push({ amount: numericAmount });
            }
            searchStage = { $match: { $or: orConditions } };
        }

        const allowedSortFields = { createdAt: 1, amount: 1 };
        const sortField = allowedSortFields[sortBy] ? sortBy : "createdAt";
        const sortDir = sortOrder === "asc" ? 1 : -1;

        const aggregate = transactionModel.aggregate([
            { $match: matchQuery },
            ...ownerLookupStages,
            ...(searchStage ? [searchStage] : []),
            {
                $lookup: {
                    from: "users",
                    let: { createdById: "$createdBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$createdById"] } } },
                        { $project: { fullName: 1, firstName: 1, lastName: 1, email: 1 } }
                    ],
                    as: "_createdByUser"
                }
            },
            {
                $addFields: {
                    createdBy: {
                        $cond: {
                            if: { $gt: [{ $size: "$_createdByUser" }, 0] },
                            then: { $arrayElemAt: ["$_createdByUser", 0] },
                            else: "$createdBy"
                        }
                    }
                }
            },
            { $project: { _createdByUser: 0 } },
            { $sort: { [sortField]: sortDir } }
        ]);

        const transactions = await transactionModel.aggregatePaginate(aggregate, { page, limit });
        return { status: true, statusCode: 200, transactions };

    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const deleteUserTransactionsQuery = async ({ userId, userModel }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }
        const filter = { userId: mongoose.Types.ObjectId.createFromHexString(userId) };
        if (userModel) filter.userModel = userModel;
        const result = await transactionModel.deleteMany(filter);
        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} transaction(s) deleted.`,
            deletedCount: result.deletedCount
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const resetFundBalancesQuery = async ({ userId, userModel }) => {
    try {
        if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid userId." };
        }
        const filter = { userId: mongoose.Types.ObjectId.createFromHexString(userId) };
        if (userModel) filter.userModel = userModel;
        const result = await userWalletModel.updateMany(filter, {
            $set: { balance: 0, totalDeposited: 0, totalWithdrawn: 0 }
        });
        return {
            status: true,
            statusCode: 200,
            message: `${result.modifiedCount} wallet(s) reset to zero.`,
            modifiedCount: result.modifiedCount
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


const deleteAllTransactionsQuery = async () => {
    try {
        const result = await transactionModel.deleteMany({});
        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} transaction record(s) deleted.`,
            deletedCount: result.deletedCount
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};


module.exports = {
    adminTransactionListQuery,
    adminTransactionSummaryQuery,
    adminUserWalletQuery,
    getUserWalletBalancesQuery,
    clientTransactionListQuery,
    deleteAllTransactionsQuery,
    deleteUserTransactionsQuery,
    resetFundBalancesQuery,
};
