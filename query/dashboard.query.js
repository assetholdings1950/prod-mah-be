const agentModel = require("../models/agent.model");
const clientModel = require("../models/client.model");
const investmentPlanModel = require("../models/investmentsplans.model");
const depositRequestModel = require("../models/depositRequest.model");
const withdrawalRequestModel = require("../models/withdrawalRequest.model");
const transactionModel = require("../models/transaction.model");

const adminDashboardSummaryQuery = async () => {
    try {
        // 1. Agents Stats
        const [totalAgents, activeAgents, loggedInAgents] = await Promise.all([
            agentModel.countDocuments(),
            agentModel.countDocuments({ status: "active" }),
            agentModel.countDocuments({ refreshToken: { $ne: null } })
        ]);

        // 2. Clients Stats
        const [totalClients, activeClients, loggedInClients] = await Promise.all([
            clientModel.countDocuments(),
            clientModel.countDocuments({ status: "active" }),
            clientModel.countDocuments({ refreshToken: { $ne: null } })
        ]);

        // 3. Investment Plans Stats
        const [totalPlans, activePlans, draftPlans, inactivePlans] = await Promise.all([
            investmentPlanModel.countDocuments(),
            investmentPlanModel.countDocuments({ status: "active" }),
            investmentPlanModel.countDocuments({ status: "draft" }),
            investmentPlanModel.countDocuments({ status: "inactive" })
        ]);

        // 4. Deposits Stats
        const depositsSummary = {
            totalCount: 0,
            pendingCount: 0,
            approvedCount: 0,
            rejectedCount: 0,
            approvedVolume: 0,
            approvedVolumeByCurrency: {}
        };
        const depositStats = await depositRequestModel.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);
        depositStats.forEach(stat => {
            depositsSummary.totalCount += stat.count;
            if (stat._id === "pending") depositsSummary.pendingCount = stat.count;
            else if (stat._id === "approved") {
                depositsSummary.approvedCount = stat.count;
                depositsSummary.approvedVolume = stat.totalAmount;
            } else if (stat._id === "rejected") {
                depositsSummary.rejectedCount = stat.count;
            }
        });

        const depositCurrencyStats = await depositRequestModel.aggregate([
            { $match: { status: "approved" } },
            {
                $group: {
                    _id: "$currency",
                    total: { $sum: "$amount" }
                }
            }
        ]);
        depositCurrencyStats.forEach(stat => {
            if (stat._id) {
                depositsSummary.approvedVolumeByCurrency[stat._id.toUpperCase()] = stat.total;
            }
        });

        // 5. Withdrawals Stats
        const withdrawalsSummary = {
            totalCount: 0,
            pendingCount: 0,
            approvedCount: 0,
            rejectedCount: 0,
            approvedVolume: 0,
            approvedVolumeByCurrency: {}
        };
        const withdrawalStats = await withdrawalRequestModel.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);
        withdrawalStats.forEach(stat => {
            withdrawalsSummary.totalCount += stat.count;
            if (stat._id === "pending") withdrawalsSummary.pendingCount = stat.count;
            else if (stat._id === "approved") {
                withdrawalsSummary.approvedCount = stat.count;
                withdrawalsSummary.approvedVolume = stat.totalAmount;
            } else if (stat._id === "rejected") {
                withdrawalsSummary.rejectedCount = stat.count;
            }
        });

        const withdrawalCurrencyStats = await withdrawalRequestModel.aggregate([
            { $match: { status: "approved" } },
            {
                $group: {
                    _id: "$currency",
                    total: { $sum: "$amount" }
                }
            }
        ]);
        withdrawalCurrencyStats.forEach(stat => {
            if (stat._id) {
                withdrawalsSummary.approvedVolumeByCurrency[stat._id.toUpperCase()] = stat.total;
            }
        });

        // 6. Transactions Stats
        const transactionsSummary = {
            totalCount: 0,
            completedCount: 0,
            pendingCount: 0,
            failedCount: 0,
            agentCount: 0,
            clientCount: 0,
            agentVolume: 0,
            clientVolume: 0
        };
        const txStats = await transactionModel.aggregate([
            {
                $facet: {
                    byStatus: [
                        { $group: { _id: "$status", count: { $sum: 1 } } }
                    ],
                    byUserType: [
                        {
                            $group: {
                                _id: "$userModel",
                                count: { $sum: 1 },
                                totalVolume: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$amount", 0] } }
                            }
                        }
                    ]
                }
            }
        ]);

        if (txStats && txStats[0]) {
            const facet = txStats[0];
            (facet.byStatus || []).forEach(s => {
                transactionsSummary.totalCount += s.count;
                if (s._id === "completed") transactionsSummary.completedCount = s.count;
                else if (s._id === "pending") transactionsSummary.pendingCount = s.count;
                else if (s._id === "failed") transactionsSummary.failedCount = s.count;
            });
            (facet.byUserType || []).forEach(ut => {
                if (ut._id === "Agent") {
                    transactionsSummary.agentCount = ut.count;
                    transactionsSummary.agentVolume = ut.totalVolume;
                } else if (ut._id === "Client") {
                    transactionsSummary.clientCount = ut.count;
                    transactionsSummary.clientVolume = ut.totalVolume;
                }
            });
        }

        // 7. Recent Transactions (last 10)
        const recentTransactions = await transactionModel.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate({
                path: "userId",
                select: "firstName lastName fullName email clientId agentId"
            })
            .lean();

        // 8. Trends
        // A. Weekly Trend (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const weeklyAggregation = await transactionModel.aggregate([
            {
                $match: {
                    status: "completed",
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        type: "$type"
                    },
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        const weeklyLabels = [];
        const weeklyData = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split("T")[0];
            weeklyLabels.push(dateStr);
            weeklyData.push({
                label: d.toLocaleDateString("en-US", { weekday: "short" }),
                date: dateStr,
                deposit: 0,
                withdrawal: 0,
                investment: 0,
                earning: 0
            });
        }

        weeklyAggregation.forEach(item => {
            const idx = weeklyLabels.indexOf(item._id.date);
            if (idx !== -1) {
                weeklyData[idx][item._id.type] = item.totalAmount;
            }
        });

        // B. Monthly Trend (last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const monthlyAggregation = await transactionModel.aggregate([
            {
                $match: {
                    status: "completed",
                    createdAt: { $gte: twelveMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                        type: "$type"
                    },
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        const monthlyLabels = [];
        const monthlyData = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const monthStr = d.toISOString().slice(0, 7);
            monthlyLabels.push(monthStr);
            monthlyData.push({
                label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
                month: monthStr,
                deposit: 0,
                withdrawal: 0,
                investment: 0,
                earning: 0
            });
        }

        monthlyAggregation.forEach(item => {
            const idx = monthlyLabels.indexOf(item._id.month);
            if (idx !== -1) {
                monthlyData[idx][item._id.type] = item.totalAmount;
            }
        });

        // C. Yearly Trend (last 5 years)
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 4);
        fiveYearsAgo.setMonth(0, 1);
        fiveYearsAgo.setHours(0, 0, 0, 0);

        const yearlyAggregation = await transactionModel.aggregate([
            {
                $match: {
                    status: "completed",
                    createdAt: { $gte: fiveYearsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $dateToString: { format: "%Y", date: "$createdAt" } },
                        type: "$type"
                    },
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        const yearlyLabels = [];
        const yearlyData = [];
        for (let i = 4; i >= 0; i--) {
            const d = new Date();
            d.setFullYear(d.getFullYear() - i);
            const yearStr = d.getFullYear().toString();
            yearlyLabels.push(yearStr);
            yearlyData.push({
                label: yearStr,
                year: yearStr,
                deposit: 0,
                withdrawal: 0,
                investment: 0,
                earning: 0
            });
        }

        yearlyAggregation.forEach(item => {
            const idx = yearlyLabels.indexOf(item._id.year);
            if (idx !== -1) {
                yearlyData[idx][item._id.type] = item.totalAmount;
            }
        });

        return {
            status: true,
            statusCode: 200,
            data: {
                agentsSummary: {
                    total: totalAgents,
                    active: activeAgents,
                    loggedIn: loggedInAgents
                },
                clientsSummary: {
                    total: totalClients,
                    active: activeClients,
                    loggedIn: loggedInClients
                },
                investmentPlansSummary: {
                    total: totalPlans,
                    active: activePlans,
                    draft: draftPlans,
                    inactive: inactivePlans
                },
                depositsSummary,
                withdrawalsSummary,
                transactionsSummary,
                recentTransactions,
                trends: {
                    weekly: weeklyData,
                    monthly: monthlyData,
                    yearly: yearlyData
                }
            }
        };

    } catch (error) {
        console.error("Dashboard calculation error: ", error);
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

module.exports = {
    adminDashboardSummaryQuery
};
