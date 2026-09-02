const mongoose = require("mongoose");

const ClientPortfolio = require("../models/clientPortfolio.model");
const InvestmentPlan  = require("../models/investmentsplans.model");
const PlanCharges     = require("../models/planCharges.model");
const UserWallet      = require("../models/userWallet.model");
const Transaction     = require("../models/transaction.model");
const Client          = require("../models/client.model");
const Agent           = require("../models/agent.model");
const SipInstallmentEvent = require("../models/sipInstallmentEvent.model");

const { default: sendNotificationMail } = require("../emailTemplate/sendNotificationMail");

const _fmt    = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

const { convertCurrency }               = require("../controller/currency.controller");
const {
    generatePortfolioId,
    getInvestmentModeByPlanCategory,
    validatePlanAmount,
    validateDuration,
    calculateDates,
    addMonths,
    calculateInvestmentReturns,
    buildPortfolioSummary,
    monthsBetween,
} = require("../helpers/portfolio.helpers");

const QUOTE_TTL_MS     = 10 * 60 * 1000; // 10 minutes
const SUPPORTED_CRYPTO = ["BTC", "ETH", "USDT", "SOL", "TRX"];

async function ensureInvestmentEligibility(clientId) {
    const client = await Client.findById(clientId).select("kycStatus accountManager").lean();
    if (!client) throw { status: 404, message: "Client not found." };
    if (client.kycStatus !== "approved") {
        throw { status: 403, code: "KYC_REQUIRED", message: "Your KYC must be approved before you can invest." };
    }
    if (!client.accountManager) {
        throw {
            status: 403,
            code: "ACCOUNT_MANAGER_REQUIRED",
            message: "An Account Manager must be assigned to your account before you can invest. Please contact support."
        };
    }
    const eligibleManager = await Agent.exists({ _id: client.accountManager, status: "active", kycStatus: "approved" });
    if (!eligibleManager) {
        throw {
            status: 403,
            code: "ACCOUNT_MANAGER_UNAVAILABLE",
            message: "Your Account Manager is currently unavailable. Please contact support before investing."
        };
    }
    return client;
}

// Returns per-charge breakdown + net amount after all deductions
function applyCharges(grossUsd, charges = []) {
    const chargesBreakdown = charges.map(c => ({
        particular:    c.particular,
        chargePercent: c.chargePercent,
        chargeUsd:     (grossUsd * c.chargePercent) / 100,
    }));
    const totalChargesUsd = chargesBreakdown.reduce((sum, c) => sum + c.chargeUsd, 0);
    return { chargesBreakdown, totalChargesUsd, netUsd: Math.max(0, grossUsd - totalChargesUsd) };
}

// ── 1. Confirm (Quote) ────────────────────────────────────────────────────────

/**
 * Generates a conversion quote for a given investment.
 * Does NOT create any database records.
 */
async function confirmPortfolioService({ clientId, planId, amountUsd, paymentCurrency, durationMonths }) {
    await ensureInvestmentEligibility(clientId);
    // ── Validate inputs ──
    const currency = (paymentCurrency || "").toUpperCase();
    if (!SUPPORTED_CRYPTO.includes(currency)) {
        throw { status: 400, message: `Payment currency must be one of: ${SUPPORTED_CRYPTO.join(", ")}.` };
    }

    const amount = parseFloat(amountUsd);
    const dur    = parseInt(durationMonths, 10);

    // ── Fetch plan ──
    const plan = await InvestmentPlan.findById(planId).lean();
    if (!plan) throw { status: 404, message: "Investment plan not found." };
    if (plan.status !== "active") throw { status: 400, message: "This investment plan is not currently active." };

    // ── Validate amount and duration ──
    const amountErr   = validatePlanAmount(plan, amount);
    const durationErr = validateDuration(plan, dur);
    if (amountErr)   throw { status: 400, message: amountErr };
    if (durationErr) throw { status: 400, message: durationErr };

    // ── Convert USD → selected crypto ──
    const conversion = await convertCurrency("USD", currency, amount);

    const now          = new Date();
    const lockedAt     = now;
    const lockedUntil  = new Date(now.getTime() + QUOTE_TTL_MS);

    const investmentMode = getInvestmentModeByPlanCategory(plan.category);
    const { maturityDate, lockInEndDate } = calculateDates(now, dur, plan.lockInMonths ?? dur);

    const returns = calculateInvestmentReturns(amount, plan.roiMin, plan.payoutType, dur);

    return {
        planId:          plan._id,
        planName:        plan.name,
        planCategory:    plan.category,
        investmentMode,
        amountUsd:       amount,
        durationMonths:  dur,
        paymentCurrency: currency,
        cryptoAmount:    conversion.convertedAmount,
        rate:            conversion.rate,
        source:          conversion.source,
        convertedAt:     now.toISOString(),
        lockedAt:        lockedAt.toISOString(),
        lockedUntil:     lockedUntil.toISOString(),
        expiresInSeconds:QUOTE_TTL_MS / 1000,
        projectedReturns: {
            monthlyInterestUsd:      returns.monthlyInterestUsd,
            expectedProfitUsd:       returns.expectedProfitUsd,
            expectedMaturityValueUsd:returns.expectedMaturityValueUsd,
        },
        maturityDate:   maturityDate.toISOString(),
        lockInEndDate:  lockInEndDate.toISOString(),
    };
}

// ── 2. Create Portfolio ───────────────────────────────────────────────────────

/**
 * Creates a client portfolio with full MongoDB transaction safety:
 *  1. Re-validates quote expiry
 *  2. Checks wallet balance
 *  3. Deducts wallet
 *  4. Creates Transaction record
 *  5. Creates ClientPortfolio
 *  6. Updates Client investment stats
 */
async function createPortfolioService({
    clientId,
    planId,
    amountUsd,
    paymentCurrency,
    durationMonths,
    cryptoAmount,
    rate,
    source,
    lockedAt,
    lockedUntil,
    convertedAt,
}) {
    await ensureInvestmentEligibility(clientId);
    // ── Re-validate quote expiry ──
    const expiry = new Date(lockedUntil);
    if (new Date() > expiry) {
        throw { status: 400, message: "Quote has expired. Please request a fresh quote." };
    }

    const currency = (paymentCurrency || "").toUpperCase();
    if (!SUPPORTED_CRYPTO.includes(currency)) {
        throw { status: 400, message: `Unsupported payment currency: ${currency}.` };
    }

    const amount   = parseFloat(amountUsd);
    const crypto   = parseFloat(cryptoAmount);
    const dur      = parseInt(durationMonths, 10);

    // ── Fetch plan ──
    const plan = await InvestmentPlan.findById(planId).lean();
    if (!plan) throw { status: 404, message: "Investment plan not found." };
    if (plan.status !== "active") throw { status: 400, message: "Investment plan is no longer active." };

    // ── Re-validate amount & duration ──
    const amountErr   = validatePlanAmount(plan, amount);
    const durationErr = validateDuration(plan, dur);
    if (amountErr)   throw { status: 400, message: amountErr };
    if (durationErr) throw { status: 400, message: durationErr };

    // ── Check wallet outside transaction (fast fail) ──
    const wallet = await UserWallet.findOne({ userId: clientId, userModel: "Client", currency });
    if (!wallet) {
        throw { status: 400, message: `You do not have a ${currency} wallet. Please deposit ${currency} first.` };
    }
    if (wallet.balance < crypto) {
        throw {
            status: 400,
            message: `Insufficient ${currency} balance. Required: ${crypto} ${currency}, Available: ${wallet.balance} ${currency}.`,
        };
    }

    // ── Pre-generate IDs so we can cross-reference ──
    const portfolioObjectId  = new mongoose.Types.ObjectId();
    const transactionObjectId= new mongoose.Types.ObjectId();
    const pfId               = generatePortfolioId();

    const now            = new Date();
    const investmentMode = getInvestmentModeByPlanCategory(plan.category);
    const { maturityDate, lockInEndDate } = calculateDates(now, dur, plan.lockInMonths ?? dur);

    // ── Build first lot ──
    const lotDurationMonths = monthsBetween(now, maturityDate);
    const returns = calculateInvestmentReturns(amount, plan.roiMin, plan.payoutType, lotDurationMonths);

    const firstLot = {
        lotNo:                    1,
        amountUsd:                amount,
        paidCurrency:             currency,
        paidAmount:               crypto,
        rate,
        source:                   source || "coingecko",
        walletTransactionId:      transactionObjectId,
        investedAt:               now,
        maturityDate,
        monthlyInterestUsd:       returns.monthlyInterestUsd,
        expectedProfitUsd:        returns.expectedProfitUsd,
        expectedMaturityValueUsd: returns.expectedMaturityValueUsd,
        status:                   "active",
    };

    // ── Build SIP metadata (only for monthly plans) ──
    const sipData = investmentMode === "sip"
        ? {
            monthlyAmountUsd:  amount,
            totalInstallments: dur,
            paidInstallments:  1,
            missedInstallments:0,
            nextDueDate:       addMonths(now, 1),
            lastPaidDate:      now,
        }
        : {
            monthlyAmountUsd:  null,
            totalInstallments: null,
            paidInstallments:  0,
            missedInstallments:0,
            nextDueDate:       null,
            lastPaidDate:      null,
        };

    const summary = buildPortfolioSummary([firstLot]);

    // ── MongoDB session transaction ──
    const session = await mongoose.startSession();

    try {
        let createdPortfolio;

        await session.withTransaction(async () => {
            // 1. Deduct wallet
            const updatedWallet = await UserWallet.findOneAndUpdate(
                { userId: clientId, userModel: "Client", currency, balance: { $gte: crypto } },
                { $inc: { balance: -crypto } },
                { new: true, session }
            );

            if (!updatedWallet) {
                throw { status: 400, message: "Insufficient wallet balance or wallet not found." };
            }

            // 2. Create portfolio document
            const [portfolio] = await ClientPortfolio.create(
                [{
                    _id:    portfolioObjectId,
                    portfolioId: pfId,
                    clientId,
                    userModel: "Client",
                    planId:  plan._id,
                    planSnapshot: {
                        name:              plan.name,
                        slug:              plan.slug,
                        category:          plan.category,
                        currency:          plan.currency || "USD",
                        roiType:           plan.roiType,
                        roiMin:            plan.roiMin,
                        roiMax:            plan.roiMax,
                        roiPeriod:         plan.roiPeriod || "annum",
                        payoutType:        plan.payoutType,
                        riskLevel:         plan.riskLevel,
                        lockInMonths:      plan.lockInMonths ?? null,
                        exitPenaltyPercent:plan.exitPenaltyPercent ?? 0,
                        minAmount:         plan.minAmount ?? null,
                        maxAmount:         plan.maxAmount ?? null,
                    },
                    investmentMode,
                    amountUsd: amount,
                    durationMonths: dur,
                    paidFromWallet: {
                        currency,
                        amount:    crypto,
                        rate,
                        source:    source || "coingecko",
                        convertedAt: convertedAt ? new Date(convertedAt) : now,
                        lockedAt:    lockedAt    ? new Date(lockedAt)    : now,
                        lockedUntil: lockedUntil ? new Date(lockedUntil) : now,
                        walletTransactionId: transactionObjectId,
                    },
                    sip: sipData,
                    lots: [firstLot],
                    summary,
                    startedAt:    now,
                    maturityDate,
                    lockInEndDate,
                    status: "active",
                }],
                { session }
            );

            // 3. Create wallet transaction record
            await Transaction.create(
                [{
                    _id:        transactionObjectId,
                    userId:     clientId,
                    userModel:  "Client",
                    type:       "investment",
                    amount:     crypto,
                    currency,
                    status:     "completed",
                    referenceId:portfolioObjectId,
                    description:`Investment in ${plan.name} (${pfId}) — ${crypto} ${currency} @ $${rate}/USD`,
                }],
                { session }
            );

            // 4. Update client investment stats
            await Client.findByIdAndUpdate(
                clientId,
                {
                    $inc: {
                        totalInvestments:      1,
                        activeInvestments:     1,
                        totalInvestedAmount:   amount,
                        activeInvestmentAmount:amount,
                        portfolioValue:        amount,
                    },
                },
                { session }
            );

            createdPortfolio = portfolio;
        });

        // Fire-and-forget: send confirmation email
        Client.findById(clientId, "email firstName").lean().then(client => {
            if (client?.email) {
                sendNotificationMail({
                    to: client.email,
                    subject: "Investment Confirmed | Merlion Asset Holdings",
                    title: "Investment Successfully Placed",
                    message: `Hi ${client.firstName || "Investor"}, your investment in <strong>${plan.name}</strong> has been received and is now pending review. Our team will activate it within 1–2 business days.`,
                    details: [
                        { label: "Plan",          value: plan.name },
                        { label: "Portfolio ID",  value: pfId },
                        { label: investmentMode === "sip" ? "Monthly Amount" : "Amount", value: `$${_fmt(amount)} USD` },
                        { label: "Paid",          value: `${Number(crypto).toFixed(6)} ${currency}` },
                        { label: "Duration",      value: `${dur} months` },
                        { label: "Maturity Date", value: _fmtDate(maturityDate) },
                        ...(investmentMode === "sip" ? [{ label: "SIP Auto-Debit", value: `$${_fmt(amount)} USD in ${currency} will be debited monthly for ${dur} installments` }] : []),
                    ],
                });
            }
        }).catch(() => {});

        return createdPortfolio;

    } finally {
        await session.endSession();
    }
}

// ── 3. My Portfolios ──────────────────────────────────────────────────────────

async function getMyPortfoliosService({ clientId, status, category, investmentMode, page = 1, limit = 10 }) {
    const filter = { clientId };
    if (status)         filter.status         = status;
    if (investmentMode) filter.investmentMode  = investmentMode;
    if (category)       filter["planSnapshot.category"] = category;

    const options = {
        page:    parseInt(page, 10),
        limit:   parseInt(limit, 10),
        sort:    { createdAt: -1 },
        lean:    true,
        select:  "-lots", // Omit lots array in list view for performance
    };

    const result = await ClientPortfolio.paginate(filter, options);

    // Aggregate totals across ALL portfolios for this client (not just this page)
    const [totals] = await ClientPortfolio.aggregate([
        { $match: { clientId: new mongoose.Types.ObjectId(clientId) } },
        {
            $group: {
                _id: null,
                totalInvestedUsd:       { $sum: "$summary.totalInvestedUsd" },
                totalExpectedProfitUsd: { $sum: "$summary.totalExpectedProfitUsd" },
                totalCurrentValueUsd:   { $sum: "$summary.currentValueUsd" },
                activePortfolioCount:   { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                monthlySipCount:        { $sum: { $cond: [{ $eq: ["$investmentMode", "sip"] }, 1, 0] } },
                lumpsumCount:           { $sum: { $cond: [{ $eq: ["$investmentMode", "lumpsum"] }, 1, 0] } },
            },
        },
    ]);

    return {
        portfolios: result.docs,
        pagination: {
            total:      result.totalDocs,
            page:       result.page,
            totalPages: result.totalPages,
            limit:      result.limit,
        },
        summary: totals
            ? {
                totalInvestedUsd:       parseFloat((totals.totalInvestedUsd || 0).toFixed(2)),
                totalExpectedProfitUsd: parseFloat((totals.totalExpectedProfitUsd || 0).toFixed(2)),
                totalCurrentValueUsd:   parseFloat((totals.totalCurrentValueUsd || 0).toFixed(2)),
                activePortfolioCount:   totals.activePortfolioCount || 0,
                monthlySipCount:        totals.monthlySipCount || 0,
                lumpsumCount:           totals.lumpsumCount || 0,
            }
            : {
                totalInvestedUsd: 0, totalExpectedProfitUsd: 0, totalCurrentValueUsd: 0,
                activePortfolioCount: 0, monthlySipCount: 0, lumpsumCount: 0,
            },
    };
}

// ── 4. Single Portfolio ───────────────────────────────────────────────────────

async function getPortfolioByIdService({ portfolioId, clientId }) {
    const portfolio = await ClientPortfolio.findOne({
        _id:      portfolioId,
        clientId,
    })
        .populate("planId", "name slug category status")
        .lean();

    if (!portfolio) {
        throw { status: 404, message: "Portfolio not found." };
    }

    return portfolio;
}

// ── 5. Pay SIP Installment ────────────────────────────────────────────────────

async function payNextSipInstallmentService({ portfolioId, clientId, paymentCurrency }) {
    const currency = (paymentCurrency || "").toUpperCase();
    if (!SUPPORTED_CRYPTO.includes(currency)) {
        throw { status: 400, message: `Payment currency must be one of: ${SUPPORTED_CRYPTO.join(", ")}.` };
    }

    const portfolio = await ClientPortfolio.findOne({ _id: portfolioId, clientId });
    if (!portfolio) throw { status: 404, message: "Portfolio not found." };
    const { sip, planSnapshot, amountUsd, maturityDate, lots } = portfolio;
    if (portfolio.investmentMode !== "sip") throw { status: 400, message: "This portfolio is not a SIP investment." };

    const missedInstallments = sip?.missedInstallments ?? 0;
    const isMissedRecovery   = missedInstallments > 0;
    const canRecoverPaused   = portfolio.status === "paused" && isMissedRecovery;

    if (portfolio.status !== "active" && !canRecoverPaused) {
        throw { status: 400, message: `Cannot pay installment for a ${portfolio.status} portfolio.` };
    }

    // Check if all installments already paid
    if (sip.paidInstallments >= sip.totalInstallments) {
        throw { status: 400, message: "All SIP installments have already been paid." };
    }

    // A missed installment may be recovered immediately. The missed-payment
    // cron has already advanced nextDueDate to preserve the billing cycle, so
    // only regular installments need to wait for their scheduled due date.
    const today = new Date();
    if (!isMissedRecovery && sip.nextDueDate && today < new Date(sip.nextDueDate)) {
        throw {
            status: 400,
            message: `Next installment is due on ${sip.nextDueDate.toISOString().slice(0, 10)}. You cannot pay early.`,
        };
    }

    // Convert monthly amount to selected crypto
    const conversion = await convertCurrency("USD", currency, amountUsd);
    const crypto      = conversion.convertedAmount;

    // Check wallet
    const wallet = await UserWallet.findOne({ userId: clientId, userModel: "Client", currency });
    if (!wallet || wallet.balance < crypto) {
        throw {
            status: 400,
            message: `Insufficient ${currency} balance. Required: ${crypto} ${currency}, Available: ${wallet?.balance ?? 0} ${currency}.`,
        };
    }

    const transactionObjectId = new mongoose.Types.ObjectId();
    const now                 = new Date();
    const nextLotNo           = lots.length + 1;
    const lotDuration         = monthsBetween(now, maturityDate);

    const returns = calculateInvestmentReturns(amountUsd, planSnapshot.roiMin, planSnapshot.payoutType, lotDuration);

    const newLot = {
        lotNo:                    nextLotNo,
        amountUsd,
        paidCurrency:             currency,
        paidAmount:               crypto,
        rate:                     conversion.rate,
        source:                   conversion.source,
        paymentMode:              "manual",
        walletTransactionId:      transactionObjectId,
        investedAt:               now,
        maturityDate,
        monthlyInterestUsd:       returns.monthlyInterestUsd,
        expectedProfitUsd:        returns.expectedProfitUsd,
        expectedMaturityValueUsd: returns.expectedMaturityValueUsd,
        status:                   "active",
    };

    const updatedLots = [...lots.map(l => l.toObject ? l.toObject() : l), newLot];
    const newSummary  = buildPortfolioSummary(updatedLots);

    const newPaidInstallments = sip.paidInstallments + 1;
    const newMissedInstallments = isMissedRecovery ? missedInstallments - 1 : missedInstallments;
    const allPaid             = newPaidInstallments >= sip.totalInstallments;
    const nextDueDate         = allPaid
        ? null
        : isMissedRecovery
            ? sip.nextDueDate
            : addMonths(new Date(sip.nextDueDate || now), 1);

    const session = await mongoose.startSession();

    try {
        let updatedPortfolio;

        await session.withTransaction(async () => {
            // 1. Deduct wallet
            const updatedWallet = await UserWallet.findOneAndUpdate(
                { userId: clientId, userModel: "Client", currency, balance: { $gte: crypto } },
                { $inc: { balance: -crypto } },
                { new: true, session }
            );
            if (!updatedWallet) throw { status: 400, message: "Insufficient wallet balance." };

            // 2. Create transaction
            await Transaction.create(
                [{
                    _id:        transactionObjectId,
                    userId:     clientId,
                    userModel:  "Client",
                    type:       "investment",
                    amount:     crypto,
                    currency,
                    status:     "completed",
                    referenceId:portfolio._id,
                    description:`SIP installment #${nextLotNo} for ${planSnapshot.name} (${portfolio.portfolioId})`,
                }],
                { session }
            );

            // 3. Update portfolio
            updatedPortfolio = await ClientPortfolio.findOneAndUpdate(
                {
                    _id:                      portfolio._id,
                    status:                   portfolio.status,
                    "sip.paidInstallments":  sip.paidInstallments,
                    "sip.missedInstallments":missedInstallments,
                    "sip.nextDueDate":       sip.nextDueDate,
                },
                {
                    $push: { lots: newLot },
                    $set: {
                        summary:                 newSummary,
                        "sip.paidInstallments": newPaidInstallments,
                        "sip.missedInstallments":newMissedInstallments,
                        "sip.lastPaidDate":     now,
                        "sip.nextDueDate":      nextDueDate,
                        ...(canRecoverPaused && { status: "active" }),
                    },
                },
                { new: true, session }
            );
            if (!updatedPortfolio) {
                throw { status: 409, message: "This SIP installment was already updated. Please refresh and try again." };
            }

            await SipInstallmentEvent.create([{
                portfolioId: portfolio._id,
                portfolioCode: portfolio.portfolioId,
                clientId,
                eventType: "manual_paid",
                installmentNo: nextLotNo,
                amountUsd,
                paymentCurrency: currency,
                paidAmount: crypto,
                rate: conversion.rate,
                rateSource: conversion.source,
                dueDate: sip.nextDueDate,
                recoveredMissed: isMissedRecovery,
                transactionId: transactionObjectId,
            }], { session });

            if (isMissedRecovery) {
                await SipInstallmentEvent.findOneAndUpdate(
                    { portfolioId: portfolio._id, eventType: "missed", resolvedAt: null },
                    { $set: { resolvedAt: now } },
                    { sort: { createdAt: 1 }, session }
                );
            }

            // 5. Update client stats
            await Client.findByIdAndUpdate(
                clientId,
                { $inc: { totalInvestedAmount: amountUsd, activeInvestmentAmount: amountUsd, portfolioValue: amountUsd } },
                { session }
            );
        });

        return updatedPortfolio;

    } finally {
        await session.endSession();
    }
}

// ── 6. Admin: Update Status ───────────────────────────────────────────────────

async function updatePortfolioStatusService({ portfolioId, status, adminId }) {
    const allowed = ["active", "paused", "matured", "closed", "cancelled"];
    if (!allowed.includes(status)) {
        throw { status: 400, message: `Invalid status. Must be one of: ${allowed.join(", ")}.` };
    }

    const portfolio = await ClientPortfolio.findById(portfolioId);
    if (!portfolio) throw { status: 404, message: "Portfolio not found." };

    const update = { status };
    if (status === "closed" || status === "cancelled") update.closedAt = new Date();

    const updated = await ClientPortfolio.findByIdAndUpdate(portfolioId, update, { new: true });

    // Reflect in client stats if closing
    if ((status === "closed" || status === "cancelled") && portfolio.status === "active") {
        await Client.findByIdAndUpdate(portfolio.clientId, {
            $inc: {
                activeInvestments:     -1,
                activeInvestmentAmount:-portfolio.amountUsd,
                portfolioValue:        -portfolio.summary.currentValueUsd,
            },
        });
    }

    // Fire-and-forget: notify client of closure
    if (status === "closed" || status === "cancelled") {
        Client.findById(portfolio.clientId, "email firstName").lean().then(client => {
            if (client?.email) {
                sendNotificationMail({
                    to: client.email,
                    subject: "Portfolio Closed | Merlion Asset Holdings",
                    title: "Your Portfolio Has Been Closed",
                    message: `Hi ${client.firstName || "Investor"}, your portfolio <strong>${portfolio.portfolioId}</strong> has been closed by our team. If you have any questions, please contact your Relationship Manager.`,
                    details: [
                        { label: "Portfolio ID", value: portfolio.portfolioId },
                        { label: "Plan",         value: portfolio.planSnapshot?.name || "Investment Plan" },
                        { label: "Status",       value: status.charAt(0).toUpperCase() + status.slice(1) },
                        { label: "Closed At",    value: _fmtDate(new Date()) },
                    ],
                });
            }
        }).catch(() => {});
    }

    return updated;
}

// ── 6. Claim Maturity Payout ──────────────────────────────────────────────────

async function claimMaturityService({ portfolioId, clientId, paymentCurrency }) {
    const currency = (paymentCurrency || "").toUpperCase();
    if (!SUPPORTED_CRYPTO.includes(currency)) {
        throw { status: 400, message: `Payment currency must be one of: ${SUPPORTED_CRYPTO.join(", ")}.` };
    }

    const portfolio = await ClientPortfolio.findOne({ _id: portfolioId, clientId });
    if (!portfolio) throw { status: 404, message: "Portfolio not found." };
    if (portfolio.status !== "matured") {
        throw { status: 400, message: "Only matured portfolios can be claimed." };
    }
    if (portfolio.closedAt) {
        throw { status: 400, message: "This portfolio has already been claimed." };
    }

    const totalUsd      = portfolio.summary.expectedMaturityValueUsd;
    const totalInvested = portfolio.summary.totalInvestedUsd;

    // Apply plan-level charges on gross payout
    const planChargesDoc = await PlanCharges.findOne({ planId: portfolio.planId }).lean();
    const { chargesBreakdown, totalChargesUsd, netUsd: netPayoutUsd } =
        applyCharges(totalUsd, planChargesDoc?.charges ?? []);

    // Live conversion at time of claim
    const conversion      = await convertCurrency("USD", currency, netPayoutUsd);
    const convertedAmount = conversion.convertedAmount;
    const rate            = conversion.rate;

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const txId = new mongoose.Types.ObjectId();

            // Upsert wallet — creates it if the client doesn't have one yet
            await UserWallet.findOneAndUpdate(
                { userId: clientId, userModel: "Client", currency },
                { $inc: { balance: convertedAmount, totalDeposited: convertedAmount } },
                { upsert: true, new: true, session }
            );

            // Maturity earning transaction
            await Transaction.create([{
                _id:         txId,
                userId:      clientId,
                userModel:   "Client",
                type:        "earning",
                amount:      convertedAmount,
                currency,
                status:      "completed",
                referenceId: portfolio._id,
                description: `Maturity payout for ${portfolio.portfolioId} — ${convertedAmount} ${currency} @ $${rate}/USD`,
            }], { session });

            // Charge transactions (one per configured charge)
            if (chargesBreakdown.length > 0) {
                await Transaction.create(
                    chargesBreakdown.map(ch => ({
                        userId:      clientId,
                        userModel:   "Client",
                        type:        "charge",
                        amount:      parseFloat((ch.chargeUsd * rate).toFixed(8)),
                        currency,
                        status:      "completed",
                        referenceId: portfolio._id,
                        description: `${ch.particular} (${ch.chargePercent}%) on maturity payout for ${portfolio.portfolioId} — $${ch.chargeUsd.toFixed(2)} USD`,
                    })),
                    { session }
                );
            }

            // Close portfolio
            await ClientPortfolio.findByIdAndUpdate(portfolio._id, {
                $set: {
                    status:   "closed",
                    closedAt: new Date(),
                    "summary.totalPaidProfitUsd": portfolio.summary.totalExpectedProfitUsd,
                    "summary.currentValueUsd":    0,
                    closedSummary: {
                        reason:           "maturity",
                        note:             "Portfolio reached full maturity.",
                        principal:        totalInvested,
                        earnedUsd:        totalUsd - totalInvested,
                        penaltyPct:       0,
                        penaltyUsd:       0,
                        chargesBreakdown,
                        totalChargesUsd,
                        netRefundUsd:     netPayoutUsd,
                        payoutCurrency:   currency,
                        convertedAmount,
                        rate,
                    },
                },
            }, { session });

            // Update client stats
            await Client.findByIdAndUpdate(clientId, {
                $inc: {
                    activeInvestments:      -1,
                    activeInvestmentAmount: -totalInvested,
                    portfolioValue:         -totalInvested,
                },
            }, { session });
        });

        // Fire-and-forget: maturity payout email
        Client.findById(clientId, "email firstName").lean().then(client => {
            if (client?.email) {
                sendNotificationMail({
                    to: client.email,
                    subject: "Maturity Payout Credited | Merlion Asset Holdings",
                    title: "Funds Transferred to Your Wallet",
                    message: `Hi ${client.firstName || "Investor"}, your maturity payout for portfolio <strong>${portfolio.portfolioId}</strong> has been processed and credited to your ${currency} wallet.`,
                    details: [
                        { label: "Portfolio ID",   value: portfolio.portfolioId },
                        { label: "Plan",           value: portfolio.planSnapshot?.name || "Investment Plan" },
                        { label: "Gross Amount",   value: `$${_fmt(totalUsd)} USD` },
                        { label: "Total Charges",  value: `$${_fmt(totalChargesUsd)} USD` },
                        { label: "Net Credited",   value: `${Number(convertedAmount).toFixed(6)} ${currency}` },
                        { label: "Credited To",    value: `${currency} Wallet` },
                    ],
                });
            }
        }).catch(() => {});

        return {
            totalUsd,
            chargesBreakdown,
            totalChargesUsd,
            netPayoutUsd,
            currency,
            convertedAmount,
            rate,
            source: conversion.source,
        };
    } finally {
        await session.endSession();
    }
}

// ── 7. Early Exit ─────────────────────────────────────────────────────────────
async function earlyExitPortfolioService({ portfolioId, clientId, paymentCurrency }) {
    const currency = (paymentCurrency || "").toUpperCase();
    if (!SUPPORTED_CRYPTO.includes(currency)) {
        throw { status: 400, message: `Payment currency must be one of: ${SUPPORTED_CRYPTO.join(", ")}.` };
    }

    const portfolio = await ClientPortfolio.findOne({ _id: portfolioId, clientId });
    if (!portfolio) throw { status: 404, message: "Portfolio not found." };
    if (portfolio.status !== "active") {
        throw { status: 400, message: "Only active portfolios can be exited early." };
    }
    if (portfolio.closedAt) {
        throw { status: 400, message: "This portfolio has already been closed." };
    }

    const snap      = portfolio.planSnapshot;
    const principal = portfolio.summary.totalInvestedUsd;
    const now       = new Date();
    const start     = new Date(portfolio.startedAt);

    // For maturity-type plans profit hasn't been distributed yet — include accrued amount.
    // For monthly/quarterly plans profit was already credited to wallet each period.
    let earnedSoFarUsd = 0;
    if (snap.payoutType === "maturity") {
        const dailyRate   = (portfolio.amountUsd * (snap.roiMin ?? 0)) / 100 / 365;
        const elapsedDays = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
        earnedSoFarUsd    = Math.min(dailyRate * elapsedDays, portfolio.summary.totalExpectedProfitUsd);
    }

    // Penalty is charged on the total value (principal + accrued profit)
    const totalValueUsd = principal + earnedSoFarUsd;
    const penaltyPct    = snap.exitPenaltyPercent ?? 0;
    const penaltyUsd    = (totalValueUsd * penaltyPct) / 100;
    const netRefundUsd  = Math.max(0, totalValueUsd - penaltyUsd);

    // Apply plan-level charges on post-penalty net amount
    const planChargesDoc = await PlanCharges.findOne({ planId: portfolio.planId }).lean();
    const { chargesBreakdown, totalChargesUsd, netUsd: netAfterChargesUsd } =
        applyCharges(netRefundUsd, planChargesDoc?.charges ?? []);

    const conversion      = await convertCurrency("USD", currency, netAfterChargesUsd);
    const convertedAmount = conversion.convertedAmount;
    const rate            = conversion.rate;

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const txId = new mongoose.Types.ObjectId();

            await UserWallet.findOneAndUpdate(
                { userId: clientId, userModel: "Client", currency },
                { $inc: { balance: convertedAmount, totalDeposited: convertedAmount } },
                { upsert: true, new: true, session }
            );

            // Net refund (after penalty + charges) credited to client
            await Transaction.create([{
                _id:         txId,
                userId:      clientId,
                userModel:   "Client",
                type:        "earning",
                amount:      convertedAmount,
                currency,
                status:      "completed",
                referenceId: portfolio._id,
                description: `Early exit refund for ${portfolio.portfolioId} — ${convertedAmount} ${currency} @ $${rate}/USD`,
            }], { session });

            // Penalty charged on total value — recorded for audit
            if (penaltyUsd > 0) {
                const penaltyConverted = penaltyUsd * rate;
                await Transaction.create([{
                    userId:      clientId,
                    userModel:   "Client",
                    type:        "penalty",
                    amount:      penaltyConverted,
                    currency,
                    status:      "completed",
                    referenceId: portfolio._id,
                    description: `Early exit penalty for ${portfolio.portfolioId} — ${penaltyPct}% on $${totalValueUsd.toFixed(2)} = $${penaltyUsd.toFixed(2)} (${penaltyConverted.toFixed(8)} ${currency})`,
                }], { session });
            }

            // Plan charge transactions — one per configured charge
            if (chargesBreakdown.length > 0) {
                await Transaction.create(
                    chargesBreakdown.map(ch => ({
                        userId:      clientId,
                        userModel:   "Client",
                        type:        "charge",
                        amount:      parseFloat((ch.chargeUsd * rate).toFixed(8)),
                        currency,
                        status:      "completed",
                        referenceId: portfolio._id,
                        description: `${ch.particular} (${ch.chargePercent}%) on early exit for ${portfolio.portfolioId} — $${ch.chargeUsd.toFixed(2)} USD`,
                    })),
                    { session }
                );
            }

            await ClientPortfolio.findByIdAndUpdate(portfolio._id, {
                $set: {
                    status:                      "closed",
                    closedAt:                    now,
                    "summary.totalPaidProfitUsd": earnedSoFarUsd,
                    "summary.currentValueUsd":    0,
                    closedSummary: {
                        reason:           "early_exit",
                        note:             "Client requested early exit before maturity.",
                        principal,
                        earnedUsd:        earnedSoFarUsd,
                        penaltyPct,
                        penaltyUsd,
                        chargesBreakdown,
                        totalChargesUsd,
                        netRefundUsd:     netAfterChargesUsd,
                        payoutCurrency:   currency,
                        convertedAmount,
                        rate,
                    },
                },
            }, { session });

            await Client.findByIdAndUpdate(clientId, {
                $inc: {
                    activeInvestments:      -1,
                    activeInvestmentAmount: -principal,
                    portfolioValue:         -principal,
                },
            }, { session });
        });

        // Fire-and-forget: early exit + funds transferred emails
        Client.findById(clientId, "email firstName").lean().then(client => {
            if (client?.email) {
                sendNotificationMail({
                    to: client.email,
                    subject: "Early Exit Processed | Merlion Asset Holdings",
                    title: "Portfolio Closed — Early Exit",
                    message: `Hi ${client.firstName || "Investor"}, your early exit request for portfolio <strong>${portfolio.portfolioId}</strong> has been processed. Your refund (after penalty and charges) has been credited to your ${currency} wallet.`,
                    details: [
                        { label: "Portfolio ID",     value: portfolio.portfolioId },
                        { label: "Plan",             value: portfolio.planSnapshot?.name || "Investment Plan" },
                        { label: "Principal",        value: `$${_fmt(principal)} USD` },
                        { label: "Early Exit Penalty", value: `${penaltyPct}% — $${_fmt(penaltyUsd)} USD` },
                        { label: "Charges",          value: `$${_fmt(totalChargesUsd)} USD` },
                        { label: "Net Refund",       value: `$${_fmt(netAfterChargesUsd)} USD` },
                        { label: "Credited",         value: `${Number(convertedAmount).toFixed(6)} ${currency}` },
                    ],
                });
            }
        }).catch(() => {});

        return { principal, earnedSoFarUsd, penaltyPct, penaltyUsd, netRefundUsd, chargesBreakdown, totalChargesUsd, netAfterChargesUsd, currency, convertedAmount, rate, source: conversion.source };
    } finally {
        await session.endSession();
    }
}

// ── Cron: mark overdue SIP installments as missed ────────────────────────────
async function checkMissedSipInstallmentsService() {
    const now = new Date();

    // Find every active SIP whose nextDueDate has already passed
    const overdue = await ClientPortfolio.find({
        investmentMode: "sip",
        status:         "active",
        "sip.nextDueDate": { $lt: now },
    }).lean();

    if (!overdue.length) return { checked: 0, missed: 0 };

    let missed = 0;

    for (const portfolio of overdue) {
        const sip          = portfolio.sip;
        const newDueDate   = addMonths(new Date(sip.nextDueDate), 1);
        const newMissed    = (sip.missedInstallments ?? 0) + 1;
        const totalInst    = sip.totalInstallments ?? 0;
        const totalMissed  = newMissed;

        // Pause the portfolio if all remaining installments are missed
        const newStatus = totalMissed >= totalInst ? "paused" : portfolio.status;

        await ClientPortfolio.updateOne(
            { _id: portfolio._id },
            {
                $inc: { "sip.missedInstallments": 1 },
                $set: {
                    "sip.nextDueDate": newDueDate,
                    ...(newStatus !== portfolio.status && { status: newStatus }),
                },
            }
        );

        missed++;
    }

    return { checked: overdue.length, missed };
}

// ── 7. Check & mark matured portfolios (called by cron) ──────────────────────

async function checkAndMarkMaturedPortfoliosService() {
    const now = new Date();

    const due = await ClientPortfolio.find({
        status:      "active",
        maturityDate: { $lte: now },
    }).lean();

    if (!due.length) return { checked: 0, matured: 0 };

    const ids = due.map(p => p._id);

    // Mark portfolios as matured and set all their lots to matured
    await ClientPortfolio.updateMany(
        { _id: { $in: ids } },
        {
            $set: {
                status: "matured",
                "lots.$[].status":      "matured",
                "summary.activeLots":   0,
            },
            $inc: {
                "summary.maturedLots": 1,
            },
        }
    );

    // Fix maturedLots to exact totalLots per portfolio (updateMany $inc is additive, set correctly per doc)
    for (const p of due) {
        await ClientPortfolio.updateOne(
            { _id: p._id },
            { $set: { "summary.maturedLots": p.summary.totalLots, "summary.activeLots": 0 } }
        );
    }

    // Fire-and-forget: send maturity email to each client
    for (const p of due) {
        Client.findById(p.clientId, "email firstName").lean().then(client => {
            if (client?.email) {
                sendNotificationMail({
                    to: client.email,
                    subject: "Your Investment Has Matured | Merlion Asset Holdings",
                    title: "Portfolio Matured — Claim Your Payout",
                    message: `Hi ${client.firstName || "Investor"}, your portfolio <strong>${p.portfolioId}</strong> has reached its maturity date. Log in to your account to claim your full maturity payout.`,
                    details: [
                        { label: "Portfolio ID",     value: p.portfolioId },
                        { label: "Plan",             value: p.planSnapshot?.name || "Investment Plan" },
                        { label: "Maturity Date",    value: _fmtDate(p.maturityDate) },
                        { label: "Total Value",      value: `$${_fmt(p.summary?.expectedMaturityValueUsd || 0)} USD` },
                    ],
                });
            }
        }).catch(() => {});
    }

    console.log(`[Maturity Cron] Marked ${due.length} portfolio(s) as matured`);
    return { checked: due.length, matured: due.length };
}

// ── 8. Claim Monthly Interest ─────────────────────────────────────────────────
async function claimMonthlyInterestService({ portfolioId, clientId, paymentCurrency }) {
    const currency = (paymentCurrency || "").toUpperCase();
    if (!SUPPORTED_CRYPTO.includes(currency)) {
        throw { status: 400, message: `Payment currency must be one of: ${SUPPORTED_CRYPTO.join(", ")}.` };
    }

    const portfolio = await ClientPortfolio.findOne({ _id: portfolioId, clientId });
    if (!portfolio) throw { status: 404, message: "Portfolio not found." };
    if (portfolio.status !== "active") throw { status: 400, message: "Only active portfolios can claim monthly interest." };

    const snap = portfolio.planSnapshot;
    if (snap.payoutType !== "monthly") throw { status: 400, message: "Monthly interest claims require a monthly payout plan." };

    const startDate = new Date(portfolio.startedAt);
    const now       = new Date();

    // Complete months elapsed (day-of-month aware)
    const rawMonths     = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
    const elapsedMonths = now.getDate() >= startDate.getDate() ? rawMonths : rawMonths - 1;

    if (elapsedMonths < 1) {
        const firstClaim = addMonths(startDate, 1);
        throw {
            status: 400,
            message: `Monthly interest can be claimed from ${firstClaim.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}.`,
        };
    }

    const monthlyEarning  = (portfolio.amountUsd * (snap.roiMin ?? 0)) / 100 / 12;
    const cappedMonths    = Math.min(elapsedMonths, portfolio.durationMonths);
    const totalEarned     = Math.min(monthlyEarning * cappedMonths, portfolio.summary.totalExpectedProfitUsd);
    const alreadyPaid     = portfolio.summary.totalPaidProfitUsd ?? 0;
    const claimableUsd    = Math.max(0, totalEarned - alreadyPaid);

    if (claimableUsd <= 0) throw { status: 400, message: "No claimable interest available at this time." };
    if (claimableUsd < 50) throw { status: 400, message: `Minimum claim is $50. Your claimable interest is $${claimableUsd.toFixed(2)} — please wait for more to accrue.` };

    // Apply plan-level charges on claimable amount
    const planChargesDoc = await PlanCharges.findOne({ planId: portfolio.planId }).lean();
    const { chargesBreakdown, totalChargesUsd, netUsd } =
        applyCharges(claimableUsd, planChargesDoc?.charges ?? []);

    const conversion       = await convertCurrency("USD", currency, netUsd);
    const convertedAmount  = conversion.convertedAmount;
    const rate             = conversion.rate;

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await UserWallet.findOneAndUpdate(
                { userId: clientId, userModel: "Client", currency },
                { $inc: { balance: convertedAmount, totalDeposited: convertedAmount } },
                { upsert: true, new: true, session }
            );
            const chargesDesc = chargesBreakdown.length
                ? `, charges $${totalChargesUsd.toFixed(2)}`
                : "";
            await Transaction.create([{
                userId: clientId, userModel: "Client", type: "earning",
                amount: convertedAmount, currency, status: "completed", referenceId: portfolio._id,
                description: `Monthly interest claim for ${portfolio.portfolioId} — gross $${claimableUsd.toFixed(2)}${chargesDesc}, net $${netUsd.toFixed(2)} → ${convertedAmount} ${currency} @ ${rate}/USD`,
            }], { session });

            // Plan charge transactions — one per configured charge
            if (chargesBreakdown.length > 0) {
                await Transaction.create(
                    chargesBreakdown.map(ch => ({
                        userId:      clientId,
                        userModel:   "Client",
                        type:        "charge",
                        amount:      parseFloat((ch.chargeUsd * rate).toFixed(8)),
                        currency,
                        status:      "completed",
                        referenceId: portfolio._id,
                        description: `${ch.particular} (${ch.chargePercent}%) on monthly interest for ${portfolio.portfolioId} — $${ch.chargeUsd.toFixed(2)} USD`,
                    })),
                    { session }
                );
            }

            await ClientPortfolio.findByIdAndUpdate(portfolio._id, {
                $inc: { "summary.totalPaidProfitUsd": claimableUsd },
            }, { session });
        });
        // Fire-and-forget: monthly interest payout email
        Client.findById(clientId, "email firstName").lean().then(client => {
            if (client?.email) {
                sendNotificationMail({
                    to: client.email,
                    subject: "Monthly Interest Credited | Merlion Asset Holdings",
                    title: "Monthly Payout Processed",
                    message: `Hi ${client.firstName || "Investor"}, your monthly interest withdrawal for portfolio <strong>${portfolio.portfolioId}</strong> has been processed and credited to your ${currency} wallet.`,
                    details: [
                        { label: "Portfolio ID",     value: portfolio.portfolioId },
                        { label: "Plan",             value: snap.name || "Investment Plan" },
                        { label: "Interest Claimed", value: `$${_fmt(claimableUsd)} USD` },
                        { label: "Charges",          value: `$${_fmt(totalChargesUsd)} USD` },
                        { label: "Net Credited",     value: `${Number(convertedAmount).toFixed(6)} ${currency}` },
                        { label: "Total Claimed",    value: `$${_fmt((portfolio.summary.totalPaidProfitUsd ?? 0) + claimableUsd)} USD` },
                    ],
                });
            }
        }).catch(() => {});

        return { claimableUsd, chargesBreakdown, totalChargesUsd, netUsd, currency, convertedAmount, rate, source: conversion.source };
    } finally {
        await session.endSession();
    }
}

// ── Admin: List all portfolios ────────────────────────────────────────────────

async function getAdminPortfolioListService({
    page = 1, limit = 20, search = "",
    status, investmentMode, category, clientId,
    startDate, endDate, sortBy = "createdAt", sortOrder = "desc",
}) {
    const filter = {};
    if (status)         filter.status         = status;
    if (investmentMode) filter.investmentMode  = investmentMode;
    if (category)       filter["planSnapshot.category"] = category;
    if (clientId)       filter.clientId       = new mongoose.Types.ObjectId(clientId);
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate)   filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const sortDir = sortOrder === "asc" ? 1 : -1;
    const sort = { [sortBy]: sortDir };

    const options = {
        page:    parseInt(page, 10),
        limit:   parseInt(limit, 10),
        sort,
        lean:    true,
        select:  "-lots",
        populate: {
            path:   "clientId",
            model:  "Client",
            select: "firstName lastName email clientId",
        },
    };

    if (search) {
        const regex = new RegExp(search, "i");
        filter.$or = [
            { portfolioId: regex },
            { "planSnapshot.name": regex },
        ];
    }

    const result = await ClientPortfolio.paginate(filter, options);
    return {
        portfolios: result.docs,
        pagination: {
            total:      result.totalDocs,
            page:       result.page,
            totalPages: result.totalPages,
            limit:      result.limit,
        },
    };
}

// ── Admin: Portfolio payout summary (aggregate across all portfolios) ─────────

async function getAdminPortfolioPayoutSummaryService() {
    const [stats] = await ClientPortfolio.aggregate([
        {
            $group: {
                _id: null,
                totalPortfolios:        { $sum: 1 },
                activeCount:            { $sum: { $cond: [{ $eq: ["$status", "active"] },   1, 0] } },
                maturedCount:           { $sum: { $cond: [{ $eq: ["$status", "matured"] },  1, 0] } },
                totalInvestedUsd:       { $sum: "$summary.totalInvestedUsd" },
                totalExpectedProfitUsd: { $sum: "$summary.totalExpectedProfitUsd" },
                totalPaidProfitUsd:     { $sum: "$summary.totalPaidProfitUsd" },
                totalCurrentValueUsd:   { $sum: "$summary.currentValueUsd" },
                sipCount:               { $sum: { $cond: [{ $eq: ["$investmentMode", "sip"] },      1, 0] } },
                lumpsumCount:           { $sum: { $cond: [{ $eq: ["$investmentMode", "lumpsum"] },  1, 0] } },
                monthlyPayoutCount:     { $sum: { $cond: [{ $eq: ["$planSnapshot.payoutType", "monthly"] },   1, 0] } },
                maturityPayoutCount:    { $sum: { $cond: [{ $eq: ["$planSnapshot.payoutType", "maturity"] },  1, 0] } },
            },
        },
    ]);

    // This month's earning transactions
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [monthlyStats] = await Transaction.aggregate([
        { $match: { type: "earning", createdAt: { $gte: monthStart } } },
        { $group: { _id: null, count: { $sum: 1 }, totalUsdEquiv: { $sum: "$amount" } } },
    ]);

    const s = stats || {};
    return {
        totalPortfolios:        s.totalPortfolios        || 0,
        activeCount:            s.activeCount            || 0,
        maturedCount:           s.maturedCount           || 0,
        totalInvestedUsd:       +(s.totalInvestedUsd       || 0).toFixed(2),
        totalExpectedProfitUsd: +(s.totalExpectedProfitUsd || 0).toFixed(2),
        totalPaidProfitUsd:     +(s.totalPaidProfitUsd     || 0).toFixed(2),
        pendingProfitUsd:       +((s.totalExpectedProfitUsd || 0) - (s.totalPaidProfitUsd || 0)).toFixed(2),
        totalCurrentValueUsd:   +(s.totalCurrentValueUsd   || 0).toFixed(2),
        sipCount:               s.sipCount               || 0,
        lumpsumCount:           s.lumpsumCount           || 0,
        monthlyPayoutCount:     s.monthlyPayoutCount     || 0,
        maturityPayoutCount:    s.maturityPayoutCount    || 0,
        thisMonthPayoutCount:   (monthlyStats?.count)    || 0,
        thisMonthPaidUsd:       +((monthlyStats?.totalUsdEquiv) || 0).toFixed(2),
    };
}

// ── Auto SIP payment (called by cron) ────────────────────────────────────────
// Tries paidFromWallet.currency first, then falls back to other wallets.
// Returns { success, currency, convertedAmount, rate, installmentNo, amountUsd }
// or { success: false, reason }.
async function autoPaySipInstallmentService(portfolio) {
    const {
        _id: portfolioObjectId,
        clientId,
        sip,
        planSnapshot,
        amountUsd,
        maturityDate,
        lots,
        portfolioId,
    } = portfolio;

    if (portfolio.status !== "active") return { success: false, reason: "not_active" };
    if (!sip || sip.paidInstallments >= sip.totalInstallments) return { success: false, reason: "all_paid" };

    const primaryCurrency = portfolio.paidFromWallet?.currency;
    const allWallets = await UserWallet.find({ userId: clientId, userModel: "Client" }).lean();

    const wallets = [
        ...allWallets.filter(w => w.currency === primaryCurrency),
        ...allWallets.filter(w => w.currency !== primaryCurrency),
    ].filter(w => SUPPORTED_CRYPTO.includes(w.currency));

    let paymentResult = null;
    let processingError = null;

    for (const wallet of wallets) {
        const currency = wallet.currency;
        let conversion;
        try { conversion = await convertCurrency("USD", currency, amountUsd); }
        catch { continue; }

        const crypto = conversion.convertedAmount;
        if ((wallet.balance || 0) < crypto) continue;

        const now          = new Date();
        const nextLotNo    = (lots?.length ?? 0) + 1;
        const lotDuration  = Math.max(1, monthsBetween(now, new Date(maturityDate)));
        const returns      = calculateInvestmentReturns(amountUsd, planSnapshot.roiMin, planSnapshot.payoutType, lotDuration);
        const txId         = new mongoose.Types.ObjectId();

        const newLot = {
            lotNo:                    nextLotNo,
            amountUsd,
            paidCurrency:             currency,
            paidAmount:               crypto,
            rate:                     conversion.rate,
            source:                   conversion.source,
            paymentMode:              "auto",
            walletTransactionId:      txId,
            investedAt:               now,
            maturityDate:             new Date(maturityDate),
            monthlyInterestUsd:       returns.monthlyInterestUsd,
            expectedProfitUsd:        returns.expectedProfitUsd,
            expectedMaturityValueUsd: returns.expectedMaturityValueUsd,
            status:                   "active",
        };

        const rawLots     = [...(lots || []).map(l => (l.toObject ? l.toObject() : l)), newLot];
        const newSummary  = buildPortfolioSummary(rawLots);
        const newPaid     = sip.paidInstallments + 1;
        const allPaid     = newPaid >= sip.totalInstallments;
        const nextDueDate = allPaid ? null : addMonths(new Date(sip.nextDueDate), 1);

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const updatedWallet = await UserWallet.findOneAndUpdate(
                    { userId: clientId, userModel: "Client", currency, balance: { $gte: crypto } },
                    { $inc: { balance: -crypto } },
                    { new: true, session }
                );
                if (!updatedWallet) throw new Error("Wallet balance changed concurrently");

                await Transaction.create([{
                    _id:         txId,
                    userId:      clientId,
                    userModel:   "Client",
                    type:        "investment",
                    amount:      crypto,
                    currency,
                    status:      "completed",
                    referenceId: portfolioObjectId,
                    description: `Auto SIP installment #${nextLotNo} for ${planSnapshot.name} (${portfolioId})`,
                }], { session });

                const updatedPortfolio = await ClientPortfolio.findOneAndUpdate(
                    {
                        _id: portfolioObjectId,
                        status: "active",
                        "sip.paidInstallments": sip.paidInstallments,
                        "sip.nextDueDate": sip.nextDueDate,
                    },
                    {
                        $push: { lots: newLot },
                        $set: {
                            summary:                 newSummary,
                            "sip.paidInstallments": newPaid,
                            "sip.lastPaidDate":     now,
                            "sip.nextDueDate":      nextDueDate,
                        },
                    },
                    { new: true, session }
                );
                if (!updatedPortfolio) throw new Error("SIP installment was already processed by another worker");

                await SipInstallmentEvent.create([{
                    portfolioId: portfolioObjectId,
                    portfolioCode: portfolioId,
                    clientId,
                    eventType: "auto_paid",
                    installmentNo: nextLotNo,
                    amountUsd,
                    paymentCurrency: currency,
                    paidAmount: crypto,
                    rate: conversion.rate,
                    rateSource: conversion.source,
                    dueDate: sip.nextDueDate,
                    transactionId: txId,
                }], { session });

                await Client.findByIdAndUpdate(clientId, {
                    $inc: {
                        totalInvestedAmount:   amountUsd,
                        activeInvestmentAmount:amountUsd,
                        portfolioValue:        amountUsd,
                    },
                }, { session });
            });

            paymentResult = {
                currency,
                convertedAmount: crypto,
                rate:            conversion.rate,
                installmentNo:   nextLotNo,
                totalInstallments: sip.totalInstallments,
                amountUsd,
                nextDueDate,
                primaryWalletUsed: currency === primaryCurrency,
            };
            break;
        } catch (err) {
            // Keep trying fallback wallets, but do not misreport database or
            // transaction failures as an insufficient wallet balance.
            processingError = err;
            console.error(`[SIP Auto-Pay] Transaction failed for ${portfolioId} using ${currency}:`, err.message);
        } finally {
            try { await session.endSession(); } catch {}
        }
    }

    if (paymentResult) {
        return { success: true, ...paymentResult, walletsChecked: wallets.length };
    }

    return {
        success: false,
        reason: processingError ? "processing_error" : "insufficient_balance",
        walletsChecked: wallets.length,
    };
}

module.exports = {
    confirmPortfolioService,
    createPortfolioService,
    getMyPortfoliosService,
    getPortfolioByIdService,
    payNextSipInstallmentService,
    updatePortfolioStatusService,
    claimMaturityService,
    earlyExitPortfolioService,
    claimMonthlyInterestService,
    checkMissedSipInstallmentsService,
    getAdminPortfolioListService,
    getAdminPortfolioPayoutSummaryService,
    checkAndMarkMaturedPortfoliosService,
    autoPaySipInstallmentService,
};
