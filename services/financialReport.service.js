const DepositRequest = require("../models/depositRequest.model");
const WithdrawalRequest = require("../models/withdrawalRequest.model");
const ClientPortfolio = require("../models/clientPortfolio.model");
const SipInstallmentEvent = require("../models/sipInstallmentEvent.model");
const { convertCurrency } = require("./currency.service");
const { addMonths } = require("../helpers/portfolio.helpers");

const SUPPORTED_CRYPTO = ["BTC", "ETH", "USDT", "SOL", "TRX"];

function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function parseDateRange(from, to) {
    const now = new Date();
    const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        throw { status: 400, message: "A valid date range is required." };
    }
    const maxDays = 366 * 3;
    if ((end - start) / 86400000 > maxDays) {
        throw { status: 400, message: "Financial reports support a maximum range of three years." };
    }
    return { start, end };
}

function normalizeFilters(input = {}) {
    const { start, end } = parseDateRange(input.from, input.to);
    const currency = String(input.currency || "all").toUpperCase();
    const userModel = String(input.userModel || "all");
    const groupBy = ["daily", "weekly", "monthly"].includes(input.groupBy) ? input.groupBy : "daily";
    if (currency !== "ALL" && !SUPPORTED_CRYPTO.includes(currency)) {
        throw { status: 400, message: `Currency must be one of: ${SUPPORTED_CRYPTO.join(", ")}.` };
    }
    if (!["all", "Client", "Agent"].includes(userModel)) {
        throw { status: 400, message: "User type must be Client, Agent, or all." };
    }
    return { start, end, currency, userModel, groupBy };
}

function requestFilter(filters, dateField, statuses) {
    const match = { [dateField]: { $gte: filters.start, $lte: filters.end } };
    if (statuses) match.status = Array.isArray(statuses) ? { $in: statuses } : statuses;
    if (filters.currency !== "ALL") match.currency = filters.currency;
    if (filters.userModel !== "all") match.userModel = filters.userModel;
    return match;
}

async function liveUsdRates(currencies) {
    const rates = { USD: 1 };
    const warnings = [];
    await Promise.all([...new Set(currencies.map(c => String(c || "").toUpperCase()).filter(Boolean))].map(async currency => {
        if (currency === "USD") return;
        try {
            const conversion = await convertCurrency(currency, "USD", 1);
            rates[currency] = conversion.rate;
        } catch (error) {
            rates[currency] = null;
            warnings.push(`Live USD conversion unavailable for ${currency}: ${error.message}`);
        }
    }));
    return { rates, warnings };
}

function usdValue(row, rates) {
    if (Number.isFinite(row?.conversion?.usdAmount)) return Number(row.conversion.usdAmount);
    const currency = String(row.currency || "USD").toUpperCase();
    const rate = rates[currency];
    return Number.isFinite(rate) ? Number(row.amount || 0) * rate : 0;
}

function bucketStart(date, groupBy) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    if (groupBy === "weekly") {
        const day = d.getUTCDay();
        d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    } else if (groupBy === "monthly") {
        d.setUTCDate(1);
    }
    return d;
}

function nextBucket(date, groupBy) {
    const d = new Date(date);
    if (groupBy === "daily") d.setUTCDate(d.getUTCDate() + 1);
    else if (groupBy === "weekly") d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
}

function bucketLabel(date, groupBy) {
    const options = groupBy === "monthly"
        ? { month: "short", year: "2-digit", timeZone: "UTC" }
        : { day: "2-digit", month: "short", timeZone: "UTC" };
    return new Date(date).toLocaleDateString("en-GB", options);
}

function emptyBuckets(start, end, groupBy) {
    const result = new Map();
    let cursor = bucketStart(start, groupBy);
    while (cursor <= end) {
        result.set(cursor.toISOString(), {
            key: cursor.toISOString(),
            label: bucketLabel(cursor, groupBy),
            depositsUsd: 0,
            withdrawalsUsd: 0,
            netFlowUsd: 0,
            autoPaid: 0,
            manualPaid: 0,
            missed: 0,
            recovered: 0,
        });
        cursor = nextBucket(cursor, groupBy);
    }
    return result;
}

function addCashRowsToBuckets(buckets, rows, type, rates, groupBy) {
    for (const row of rows) {
        const key = bucketStart(row.approvedAt || row.createdAt, groupBy).toISOString();
        const bucket = buckets.get(key);
        if (!bucket) continue;
        const value = usdValue(row, rates);
        if (type === "deposit") bucket.depositsUsd += value;
        else bucket.withdrawalsUsd += value;
    }
}

function finalizeCashBuckets(buckets) {
    return [...buckets.values()].map(item => ({
        ...item,
        depositsUsd: round(item.depositsUsd),
        withdrawalsUsd: round(item.withdrawalsUsd),
        netFlowUsd: round(item.depositsUsd - item.withdrawalsUsd),
    }));
}

function scheduledInstallments(portfolio, start, end) {
    const total = Number(portfolio.sip?.totalInstallments || 0);
    if (total <= 1 || !portfolio.startedAt) return 0;
    let count = 0;
    for (let index = 1; index < total; index += 1) {
        const due = addMonths(new Date(portfolio.startedAt), index);
        if (due >= start && due <= end) count += 1;
    }
    return count;
}

function addSipEventsToBuckets(buckets, events, groupBy) {
    for (const event of events) {
        const key = bucketStart(event.createdAt, groupBy).toISOString();
        const bucket = buckets.get(key);
        if (!bucket) continue;
        if (event.eventType === "auto_paid") bucket.autoPaid += 1;
        if (event.eventType === "manual_paid") {
            bucket.manualPaid += 1;
            if (event.recoveredMissed) bucket.recovered += 1;
        }
        if (event.eventType === "missed") bucket.missed += 1;
    }
    return [...buckets.values()].map(({ key, label, autoPaid, manualPaid, missed, recovered }) => ({
        key, label, autoPaid, manualPaid, missed, recovered,
    }));
}

async function getFinancialReportService(input) {
    const filters = normalizeFilters(input);
    const approvedDepositFilter = requestFilter(filters, "approvedAt", "approved");
    const approvedWithdrawalFilter = requestFilter(filters, "approvedAt", "approved");
    const openDepositFilter = requestFilter(filters, "createdAt", "pending");
    const openWithdrawalFilter = requestFilter(filters, "createdAt", "pending");

    const portfolioMatch = { investmentMode: "sip", startedAt: { $lte: filters.end } };
    if (filters.currency !== "ALL") portfolioMatch["paidFromWallet.currency"] = filters.currency;
    if (filters.userModel === "Agent") portfolioMatch._id = { $exists: false };

    const eventMatch = { createdAt: { $gte: filters.start, $lte: filters.end } };
    if (filters.currency !== "ALL") eventMatch.paymentCurrency = filters.currency;

    const [deposits, withdrawals, pendingDeposits, pendingWithdrawals, portfolios, events] = await Promise.all([
        DepositRequest.find(approvedDepositFilter).lean(),
        WithdrawalRequest.find(approvedWithdrawalFilter).lean(),
        DepositRequest.find(openDepositFilter).lean(),
        WithdrawalRequest.find(openWithdrawalFilter).lean(),
        ClientPortfolio.find(portfolioMatch)
            .select("portfolioId clientId userModel planSnapshot amountUsd startedAt sip paidFromWallet status")
            .populate("clientId", "firstName lastName email")
            .lean(),
        SipInstallmentEvent.find(eventMatch).sort({ createdAt: 1 }).lean(),
    ]);

    const currencies = [
        ...deposits, ...withdrawals, ...pendingDeposits, ...pendingWithdrawals,
    ].map(row => row.currency);
    const { rates, warnings } = await liveUsdRates(currencies);

    const totalDepositsUsd = deposits.reduce((sum, row) => sum + usdValue(row, rates), 0);
    const totalWithdrawalsUsd = withdrawals.reduce((sum, row) => sum + usdValue(row, rates), 0);
    const pendingVolumeUsd = [...pendingDeposits, ...pendingWithdrawals]
        .reduce((sum, row) => sum + usdValue(row, rates), 0);

    const cashBuckets = emptyBuckets(filters.start, filters.end, filters.groupBy);
    addCashRowsToBuckets(cashBuckets, deposits, "deposit", rates, filters.groupBy);
    addCashRowsToBuckets(cashBuckets, withdrawals, "withdrawal", rates, filters.groupBy);

    const currencyMap = new Map();
    for (const row of deposits) {
        const currency = String(row.currency || "").toUpperCase();
        const item = currencyMap.get(currency) || { currency, nativeVolume: 0, usdEquivalent: 0, transactions: 0, sharePct: 0 };
        item.nativeVolume += Number(row.amount || 0);
        item.usdEquivalent += usdValue(row, rates);
        item.transactions += 1;
        currencyMap.set(currency, item);
    }
    const currencyBreakdown = [...currencyMap.values()]
        .map(item => ({
            ...item,
            nativeVolume: round(item.nativeVolume, 8),
            usdEquivalent: round(item.usdEquivalent),
            sharePct: totalDepositsUsd ? round((item.usdEquivalent / totalDepositsUsd) * 100, 1) : 0,
        }))
        .sort((a, b) => b.usdEquivalent - a.usdEquivalent);

    const userVolume = { Client: 0, Agent: 0 };
    for (const row of [...deposits, ...withdrawals]) {
        if (userVolume[row.userModel] !== undefined) userVolume[row.userModel] += usdValue(row, rates);
    }
    const totalUserVolume = userVolume.Client + userVolume.Agent;

    const expectedInstallments = portfolios.reduce((sum, portfolio) => sum + scheduledInstallments(portfolio, filters.start, filters.end), 0);
    const autoPaid = events.filter(event => event.eventType === "auto_paid").length;
    const manualPaid = events.filter(event => event.eventType === "manual_paid").length;
    const missed = events.filter(event => event.eventType === "missed").length;
    const recovered = events.filter(event => event.eventType === "manual_paid" && event.recoveredMissed).length;
    const processingErrors = events.filter(event => event.eventType === "processing_error").length;
    const paidTotal = autoPaid + manualPaid;
    const collectionRate = expectedInstallments ? Math.min(100, (paidTotal / expectedInstallments) * 100) : 0;

    const currentOutstandingUsd = portfolios.reduce((sum, portfolio) => (
        sum + Number(portfolio.sip?.missedInstallments || 0) * Number(portfolio.sip?.monthlyAmountUsd || portfolio.amountUsd || 0)
    ), 0);

    const latestMissByPortfolio = new Map();
    for (const event of events) {
        if (event.eventType === "missed") latestMissByPortfolio.set(String(event.portfolioId), event.createdAt);
    }
    const attention = portfolios
        .filter(portfolio => Number(portfolio.sip?.missedInstallments || 0) > 0)
        .map(portfolio => {
            const missedCount = Number(portfolio.sip.missedInstallments || 0);
            const amount = Number(portfolio.sip.monthlyAmountUsd || portfolio.amountUsd || 0);
            return {
                clientId: portfolio.clientId?._id || portfolio.clientId,
                clientName: [portfolio.clientId?.firstName, portfolio.clientId?.lastName].filter(Boolean).join(" ") || "Unknown client",
                email: portfolio.clientId?.email || "",
                portfolioId: portfolio.portfolioId,
                planName: portfolio.planSnapshot?.name || "Investment plan",
                missedInstallments: missedCount,
                outstandingUsd: round(missedCount * amount),
                lastAttemptAt: latestMissByPortfolio.get(String(portfolio._id)) || portfolio.sip?.lastPaidDate || null,
            };
        })
        .sort((a, b) => b.missedInstallments - a.missedInstallments || b.outstandingUsd - a.outstandingUsd)
        .slice(0, 20);

    const sipBuckets = addSipEventsToBuckets(
        emptyBuckets(filters.start, filters.end, filters.groupBy),
        events,
        filters.groupBy
    );

    return {
        status: true,
        generatedAt: new Date().toISOString(),
        filters: {
            from: filters.start.toISOString(),
            to: filters.end.toISOString(),
            currency: filters.currency === "ALL" ? "all" : filters.currency,
            userModel: filters.userModel,
            groupBy: filters.groupBy,
        },
        supportedCurrencies: SUPPORTED_CRYPTO,
        warnings,
        cashFlow: {
            summary: {
                approvedDepositsUsd: round(totalDepositsUsd),
                approvedWithdrawalsUsd: round(totalWithdrawalsUsd),
                netCashFlowUsd: round(totalDepositsUsd - totalWithdrawalsUsd),
                pendingVolumeUsd: round(pendingVolumeUsd),
                approvedDepositCount: deposits.length,
                approvedWithdrawalCount: withdrawals.length,
                pendingDepositCount: pendingDeposits.length,
                pendingWithdrawalCount: pendingWithdrawals.length,
            },
            trend: finalizeCashBuckets(cashBuckets),
            currencyBreakdown,
            userBreakdown: {
                clientPct: totalUserVolume ? round((userVolume.Client / totalUserVolume) * 100, 1) : 0,
                agentPct: totalUserVolume ? round((userVolume.Agent / totalUserVolume) * 100, 1) : 0,
                clientVolumeUsd: round(userVolume.Client),
                agentVolumeUsd: round(userVolume.Agent),
            },
        },
        sipCollection: {
            summary: {
                totalSipPortfolios: portfolios.length,
                expectedInstallments,
                autoPaid,
                manualPaid,
                missed,
                recovered,
                insufficientBalance: missed,
                processingErrors,
                collectionRate: round(collectionRate, 1),
                outstandingUsd: round(currentOutstandingUsd),
            },
            outcomes: sipBuckets,
            clientsRequiringAttention: attention,
            trackingNote: "Automatic/manual outcome history is recorded from the SIP event-ledger deployment onward; current outstanding values include existing portfolio counters.",
        },
    };
}

module.exports = { getFinancialReportService, normalizeFilters, scheduledInstallments };
