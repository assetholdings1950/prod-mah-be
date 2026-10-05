const mongoose = require("mongoose");
const Bond = require("../models/bond.model");
const Client = require("../models/client.model");
const UserWallet = require("../models/userWallet.model");
const Transaction = require("../models/transaction.model");
const ClientBondInvestment = require("../models/clientBondInvestment.model");
const { ensureInvestmentEligibility, SUPPORTED_CRYPTO } = require("./portfolio.service");
const { creditCommissionForCompletedInvestment } = require("./agentCommission.service");

const QUOTE_TTL_MS = 10 * 60 * 1000;
const investmentReference = () => `MAH-BND-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const addMonths = (date, months) => { const result = new Date(date); result.setMonth(result.getMonth() + months); return result; };

function validateAmount(bond, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return "Investment amount must be a positive number.";
    if (amount < bond.minInvestment) return `Minimum investment amount for this bond is $${bond.minInvestment}.`;
    if (bond.maxInvestment != null && amount > bond.maxInvestment) return `Maximum investment amount for this bond is $${bond.maxInvestment}.`;
    return null;
}

async function createBondInvestmentService({ clientId, bondId, amountUsd, paymentCurrency, cryptoAmount, rate, source, lockedAt, lockedUntil, convertedAt }) {
    await ensureInvestmentEligibility(clientId);
    if (!mongoose.isValidObjectId(bondId)) throw { status: 400, message: "A valid bond is required." };
    if (!lockedUntil || new Date() > new Date(lockedUntil)) throw { status: 400, message: "Quote has expired. Please refresh the rate and try again." };

    const currency = String(paymentCurrency || "").toUpperCase();
    const amount = Number(amountUsd); const crypto = Number(cryptoAmount); const numericRate = Number(rate);
    if (!SUPPORTED_CRYPTO.includes(currency)) throw { status: 400, message: `Unsupported payment currency: ${currency}.` };
    if (!Number.isFinite(crypto) || crypto <= 0 || !Number.isFinite(numericRate) || numericRate <= 0) throw { status: 400, message: "A valid payment conversion is required." };

    const bond = await Bond.findOne({ _id: bondId, status: "active" }).lean();
    if (!bond) throw { status: 404, message: "Bond not found or no longer active." };
    const amountError = validateAmount(bond, amount);
    if (amountError) throw { status: 400, message: amountError };

    const wallet = await UserWallet.findOne({ userId: clientId, userModel: "Client", currency }).lean();
    if (!wallet || wallet.balance < crypto) throw { status: 400, message: `Insufficient ${currency} wallet balance for this investment.` };

    const now = new Date(); const maturityDate = addMonths(now, bond.termMonths);
    const investmentObjectId = new mongoose.Types.ObjectId();
    const transactionObjectId = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession();
    let investment;
    try {
        await session.withTransaction(async () => {
            const debitedWallet = await UserWallet.findOneAndUpdate(
                { userId: clientId, userModel: "Client", currency, balance: { $gte: crypto } },
                { $inc: { balance: -crypto } }, { new: true, session }
            );
            if (!debitedWallet) throw { status: 400, message: "Insufficient wallet balance or wallet not found." };
            const [created] = await ClientBondInvestment.create([{
                _id: investmentObjectId, clientId, bondId: bond._id, investmentId: investmentReference(), amountUsd: amount,
                paidFromWallet: { currency, amount: crypto, rate: numericRate, source: source || "coingecko", convertedAt: convertedAt ? new Date(convertedAt) : now, lockedAt: lockedAt ? new Date(lockedAt) : now, lockedUntil: new Date(lockedUntil), walletTransactionId: transactionObjectId },
                bondSnapshot: {
                    name: bond.name, code: bond.code, slug: bond.slug, currency: bond.currency, termMonths: bond.termMonths,
                    couponRateAnnual: bond.couponRateAnnual, couponFrequency: bond.couponFrequency, riskLevel: bond.riskLevel,
                    minInvestment: bond.minInvestment, maxInvestment: bond.maxInvestment, usdtBenefitEnabled: bond.usdtBenefitEnabled,
                    usdtBenefitPercent: bond.usdtBenefitPercent, usdtLockType: bond.usdtLockType, usdtLockMonths: bond.usdtLockMonths,
                    usdtUnlockMethod: bond.usdtUnlockMethod, earlyRedemptionAllowed: bond.earlyRedemptionAllowed,
                    minHoldingMonths: bond.minHoldingMonths, noticeDays: bond.noticeDays, principalPenaltyPercent: bond.principalPenaltyPercent,
                    usdtEarlyExitTreatment: bond.usdtEarlyExitTreatment, usdtPartialForfeitPercent: bond.usdtPartialForfeitPercent,
                    unpaidCouponTreatment: bond.unpaidCouponTreatment, paidCouponTreatment: bond.paidCouponTreatment,
                    paidCouponClawbackPercent: bond.paidCouponClawbackPercent, redemptionFeePercent: bond.redemptionFeePercent,
                }, startedAt: now, maturityDate, status: "active",
            }], { session });
            investment = created;
            await Transaction.create([{ _id: transactionObjectId, userId: clientId, userModel: "Client", type: "investment", amount: crypto, currency, usdAmount: amount, rateToUsd: numericRate, rateSource: source || "coingecko", convertedAt: convertedAt ? new Date(convertedAt) : now, status: "completed", referenceId: investmentObjectId, description: `Bond investment in ${bond.name} (${investment.investmentId}) — ${crypto} ${currency}`, metadata: { assetType: "bond", bondId: bond._id, bondCode: bond.code, investmentId: investment.investmentId } }], { session });
            await Client.findByIdAndUpdate(clientId, { $inc: { totalInvestments: 1, activeInvestments: 1, totalInvestedAmount: amount, activeInvestmentAmount: amount, portfolioValue: amount } }, { session });
        });
    } finally { await session.endSession(); }
    try { await creditCommissionForCompletedInvestment(transactionObjectId); } catch (error) { console.error("[Commission] Could not credit bond investment:", error.message); }
    return investment;
}

async function getMyBondInvestmentsService({ clientId, status, page = 1, limit = 9 }) {
    const filter = { clientId };
    if (status) filter.status = status;

    const result = await ClientBondInvestment.paginate(filter, {
        page: Math.max(1, Number(page) || 1),
        limit: Math.min(50, Math.max(1, Number(limit) || 9)),
        sort: { createdAt: -1 },
        lean: true,
    });

    const [summary] = await ClientBondInvestment.aggregate([
        { $match: { clientId: new mongoose.Types.ObjectId(clientId) } },
        {
            $group: {
                _id: null,
                totalInvestedUsd: { $sum: "$amountUsd" },
                activeInvestmentCount: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                activeInvestedUsd: { $sum: { $cond: [{ $eq: ["$status", "active"] }, "$amountUsd", 0] } },
            },
        },
    ]);

    return {
        investments: result.docs,
        summary: {
            totalInvestedUsd: summary?.totalInvestedUsd || 0,
            activeInvestmentCount: summary?.activeInvestmentCount || 0,
            activeInvestedUsd: summary?.activeInvestedUsd || 0,
        },
        pagination: { total: result.totalDocs, page: result.page, totalPages: result.totalPages, limit: result.limit },
    };
}

module.exports = { createBondInvestmentService, getMyBondInvestmentsService, QUOTE_TTL_MS };
