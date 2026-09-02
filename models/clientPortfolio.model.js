const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

// ── Lot sub-schema (one per installment / one-time investment) ────────────────
const lotSchema = new mongoose.Schema(
    {
        lotNo: { type: Number, required: true },

        amountUsd: { type: Number, required: true, min: 0 },

        paidCurrency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            enum: ["BTC", "ETH", "USDT", "SOL", "TRX"],
        },
        paidAmount: { type: Number, required: true, min: 0 },
        rate: { type: Number, required: true },
        source: { type: String, default: "" },
        paymentMode: {
            type: String,
            enum: ["initial", "manual", "auto"],
            default: "initial",
        },

        walletTransactionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Transaction",
            default: null,
        },

        investedAt: { type: Date, required: true },
        maturityDate: { type: Date, required: true },

        // Interest breakdown
        monthlyInterestUsd: { type: Number, default: 0 },
        expectedProfitUsd: { type: Number, default: 0 },
        expectedMaturityValueUsd: { type: Number, default: 0 },

        status: {
            type: String,
            enum: ["active", "matured", "closed"],
            default: "active",
        },
    },
    { _id: true, versionKey: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────
const clientPortfolioSchema = new mongoose.Schema(
    {
        clientId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "userModel",
            index: true,
        },

        userModel: {
            type: String,
            enum: ["Client", "Agent", "User"],
            default: "Client",
        },

        portfolioId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
        },

        planId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "InvestmentPlan",
            required: true,
            index: true,
        },

        // Snapshot of the plan at investment time — never changes
        planSnapshot: {
            name: { type: String },
            slug: { type: String },
            category: { type: String, enum: ["monthly", "lumpsum", "crypto"] },
            currency: { type: String, default: "USD" },
            roiType: { type: String, enum: ["fixed", "range"] },
            roiMin: { type: Number },
            roiMax: { type: Number },
            roiPeriod: { type: String, default: "annum" },
            payoutType: { type: String, enum: ["monthly", "quarterly", "maturity"] },
            riskLevel: { type: String, enum: ["low", "medium", "high", "very_high"] },
            lockInMonths: { type: Number, default: null },
            exitPenaltyPercent: { type: Number, default: 0 },
            minAmount: { type: Number, default: null },
            maxAmount: { type: Number, default: null },
        },

        investmentMode: {
            type: String,
            enum: ["sip", "lumpsum"],
            required: true,
            index: true,
        },

        // Base investment amount always in USD — never changes after creation
        amountUsd: { type: Number, required: true, min: 0 },

        durationMonths: { type: Number, required: true, min: 1 },

        // First (or one-time) payment wallet info
        paidFromWallet: {
            currency: {
                type: String,
                required: true,
                uppercase: true,
                trim: true,
                enum: ["BTC", "ETH", "USDT", "SOL", "TRX"],
            },
            amount: { type: Number, required: true, min: 0 },
            rate: { type: Number, required: true },
            source: { type: String, default: "" },
            convertedAt: { type: Date },
            lockedAt: { type: Date },
            lockedUntil: { type: Date },
            walletTransactionId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Transaction",
                default: null,
            },
        },

        // SIP-specific metadata (null for lumpsum)
        sip: {
            monthlyAmountUsd: { type: Number, default: null },
            totalInstallments: { type: Number, default: null },
            paidInstallments: { type: Number, default: 0 },
            missedInstallments: { type: Number, default: 0 },
            nextDueDate: { type: Date, default: null },
            lastPaidDate: { type: Date, default: null },
        },

        lots: { type: [lotSchema], default: [] },

        // Running summary — updated on every lot addition
        summary: {
            totalInvestedUsd: { type: Number, default: 0 },
            totalExpectedProfitUsd: { type: Number, default: 0 },
            totalPaidProfitUsd: { type: Number, default: 0 },
            currentValueUsd: { type: Number, default: 0 },
            expectedMaturityValueUsd: { type: Number, default: 0 },
            totalLots: { type: Number, default: 0 },
            activeLots: { type: Number, default: 0 },
            maturedLots: { type: Number, default: 0 },
        },

        // Closure details — populated when the portfolio is closed
        closedSummary: {
            reason:          { type: String, enum: ["maturity", "early_exit", "admin"], default: null },
            note:            { type: String, default: null },
            principal:       { type: Number, default: null },
            earnedUsd:       { type: Number, default: null },
            penaltyPct:      { type: Number, default: null },
            penaltyUsd:      { type: Number, default: null },
            chargesBreakdown: [{
                particular:    { type: String },
                chargePercent: { type: Number },
                chargeUsd:     { type: Number },
                _id:           false,
            }],
            totalChargesUsd: { type: Number, default: 0 },
            netRefundUsd:    { type: Number, default: null },
            payoutCurrency:  { type: String, default: null },
            convertedAmount: { type: Number, default: null },
            rate:            { type: Number, default: null },
        },

        // Key dates
        startedAt: { type: Date, default: null },
        maturityDate: { type: Date, default: null },
        lockInEndDate: { type: Date, default: null },
        closedAt: { type: Date, default: null },

        status: {
            type: String,
            enum: ["active", "paused", "matured", "closed", "cancelled"],
            default: "active",
            index: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: "client_portfolios",
    }
);

clientPortfolioSchema.index({ clientId: 1, status: 1 });
clientPortfolioSchema.index({ clientId: 1, investmentMode: 1 });
clientPortfolioSchema.index({ clientId: 1, createdAt: -1 });
clientPortfolioSchema.index({ "planSnapshot.category": 1 });
clientPortfolioSchema.index({ maturityDate: 1 });

clientPortfolioSchema.plugin(mongoosePaginate);
clientPortfolioSchema.plugin(aggregatePaginate);

const ClientPortfolio =
    mongoose.models.ClientPortfolio ||
    mongoose.model("ClientPortfolio", clientPortfolioSchema);

module.exports = ClientPortfolio;
