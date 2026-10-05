const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const clientBondInvestmentSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true, index: true },
    bondId: { type: mongoose.Schema.Types.ObjectId, ref: "Bond", required: true, index: true },
    investmentId: { type: String, required: true, unique: true, index: true, trim: true },
    amountUsd: { type: Number, required: true, min: 0 },
    paidFromWallet: {
        currency: { type: String, enum: ["BTC", "ETH", "USDT", "SOL", "TRX"], required: true },
        amount: { type: Number, required: true, min: 0 },
        rate: { type: Number, required: true },
        source: { type: String, default: "" },
        convertedAt: { type: Date, default: null },
        lockedAt: { type: Date, default: null },
        lockedUntil: { type: Date, default: null },
        walletTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null },
    },
    bondSnapshot: {
        name: String, code: String, slug: String, currency: { type: String, default: "USD" },
        termMonths: Number, couponRateAnnual: Number,
        couponFrequency: { type: String, enum: ["monthly", "quarterly", "semiannual", "annual", "maturity"] },
        riskLevel: String, minInvestment: Number, maxInvestment: Number,
        usdtBenefitEnabled: Boolean, usdtBenefitPercent: Number, usdtLockType: String, usdtLockMonths: Number, usdtUnlockMethod: String,
        earlyRedemptionAllowed: Boolean, minHoldingMonths: Number, noticeDays: Number, principalPenaltyPercent: Number,
        usdtEarlyExitTreatment: String, usdtPartialForfeitPercent: Number, unpaidCouponTreatment: String,
        paidCouponTreatment: String, paidCouponClawbackPercent: Number, redemptionFeePercent: Number,
    },
    startedAt: { type: Date, required: true },
    maturityDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ["active", "matured", "closed", "cancelled"], default: "active", index: true },
}, { timestamps: true, versionKey: false, collection: "client_bond_investments" });

clientBondInvestmentSchema.index({ clientId: 1, status: 1, createdAt: -1 });
clientBondInvestmentSchema.plugin(mongoosePaginate);

module.exports = mongoose.models.ClientBondInvestment || mongoose.model("ClientBondInvestment", clientBondInvestmentSchema);
