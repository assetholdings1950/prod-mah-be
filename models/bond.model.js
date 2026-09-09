const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const bondSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        code: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true, immutable: true },
        slug: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
        shortDescription: { type: String, trim: true, default: "" },
        description: { type: String, trim: true, default: "" },

        currency: { type: String, enum: ["USD"], default: "USD" },
        minInvestment: { type: Number, required: true, min: 0 },
        maxInvestment: { type: Number, min: 0, default: null },
        termMonths: { type: Number, required: true, min: 1 },

        couponRateAnnual: { type: Number, required: true, min: 0, max: 100 },
        couponFrequency: {
            type: String,
            enum: ["monthly", "quarterly", "semiannual", "annual", "maturity"],
            default: "quarterly",
            required: true,
        },

        usdtBenefitEnabled: { type: Boolean, default: true },
        usdtBenefitPercent: { type: Number, min: 0, max: 100, default: 50 },
        usdtLockType: { type: String, enum: ["same_as_bond", "custom"], default: "same_as_bond" },
        usdtLockMonths: { type: Number, min: 1, default: null },
        usdtUnlockMethod: { type: String, enum: ["automatic", "admin_approval"], default: "automatic" },
        usdtDescription: { type: String, trim: true, default: "" },

        earlyRedemptionAllowed: { type: Boolean, default: true },
        minHoldingMonths: { type: Number, min: 0, default: 0 },
        noticeDays: { type: Number, min: 0, default: 0 },
        principalPenaltyPercent: { type: Number, min: 0, max: 100, default: 0 },
        usdtEarlyExitTreatment: {
            type: String,
            enum: ["full_forfeit", "partial_forfeit", "retain", "admin_review"],
            default: "full_forfeit",
        },
        usdtPartialForfeitPercent: { type: Number, min: 0, max: 100, default: null },
        unpaidCouponTreatment: {
            type: String,
            enum: ["forfeit", "pay_accrued", "admin_review"],
            default: "forfeit",
        },
        paidCouponTreatment: {
            type: String,
            enum: ["no_clawback", "full_clawback", "partial_clawback"],
            default: "no_clawback",
        },
        paidCouponClawbackPercent: { type: Number, min: 0, max: 100, default: null },
        redemptionFeePercent: { type: Number, min: 0, max: 100, default: 0 },
        earlyRedemptionTerms: { type: String, trim: true, default: "" },

        riskLevel: { type: String, enum: ["low", "medium", "high", "very_high"], default: "medium", index: true },
        termsAndConditions: { type: String, trim: true, default: "" },
        riskDisclosure: { type: String, trim: true, default: "" },
        usdtDisclosure: { type: String, trim: true, default: "" },
        offeringDocumentUrl: { type: String, trim: true, default: "" },
        termSheetUrl: { type: String, trim: true, default: "" },
        internalNotes: { type: String, trim: true, default: "" },

        status: {
            type: String,
            enum: ["draft", "active", "inactive", "matured", "archived"],
            default: "draft",
            index: true,
        },
        featured: { type: Boolean, default: false },
        sortOrder: { type: Number, default: 0 },
        version: { type: Number, min: 1, default: 1 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true, versionKey: false }
);

bondSchema.pre("validate", function () {
    if (this.minInvestment <= 0) this.invalidate("minInvestment", "Minimum investment must be greater than zero.");
    if (this.couponRateAnnual <= 0) this.invalidate("couponRateAnnual", "Annual coupon rate must be greater than zero.");
    if (this.maxInvestment != null && this.maxInvestment < this.minInvestment) {
        this.invalidate("maxInvestment", "Maximum investment must be greater than or equal to minimum investment.");
    }
    if (this.usdtBenefitEnabled && this.usdtBenefitPercent <= 0) {
        this.invalidate("usdtBenefitPercent", "USDT benefit must be greater than zero when enabled.");
    }
    if (this.usdtBenefitEnabled && this.usdtLockType === "custom" && !this.usdtLockMonths) {
        this.invalidate("usdtLockMonths", "Custom USDT lock period is required.");
    }
    if (this.earlyRedemptionAllowed && this.usdtEarlyExitTreatment === "partial_forfeit" && !this.usdtPartialForfeitPercent) {
        this.invalidate("usdtPartialForfeitPercent", "Partial USDT forfeiture percentage is required.");
    }
    if (this.earlyRedemptionAllowed && this.paidCouponTreatment === "partial_clawback" && !this.paidCouponClawbackPercent) {
        this.invalidate("paidCouponClawbackPercent", "Partial coupon clawback percentage is required.");
    }
    if (this.usdtLockType === "same_as_bond") this.usdtLockMonths = null;
    if (!this.usdtBenefitEnabled) {
        this.usdtBenefitPercent = 0;
        this.usdtLockMonths = null;
    }
    if (this.usdtEarlyExitTreatment !== "partial_forfeit") this.usdtPartialForfeitPercent = null;
    if (this.paidCouponTreatment !== "partial_clawback") this.paidCouponClawbackPercent = null;
});

bondSchema.plugin(mongoosePaginate);
bondSchema.index({ name: "text", code: "text", slug: "text" });
bondSchema.index({ status: 1, riskLevel: 1, sortOrder: 1 });

module.exports = mongoose.models.Bond || mongoose.model("Bond", bondSchema);
