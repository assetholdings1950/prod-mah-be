const mongoose = require("mongoose");

const dateString = {
    type: String,
    trim: true,
    validate: {
        validator: (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
        message: "Date must use YYYY-MM-DD format.",
    },
};

const activitySchema = new mongoose.Schema({
    rowId: { type: String, trim: true, default: "" },
    label: { type: String, required: true, trim: true },
    days: { type: Number, required: true, min: 1 },
    from: { ...dateString, required: true },
    to: { ...dateString, required: true },
    clients: { type: Number, required: true, min: 0 },
    capital: { type: Number, required: true, min: 0 },
}, { _id: false });

const allocationSchema = new mongoose.Schema({
    rowId: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    description: { type: String, trim: true, default: "" },
}, { _id: false });

const profitSchema = new mongoose.Schema({
    rowId: { type: String, trim: true, default: "" },
    label: { type: String, required: true, trim: true },
    days: { type: Number, required: true, min: 1 },
    from: { ...dateString, required: true },
    to: { ...dateString, required: true },
    profit: { type: Number, required: true },
    returnPercentage: { type: Number, required: true },
    feeBasis: { type: String, enum: ["gross", "net"], default: "net" },
    profitType: { type: String, enum: ["realized", "unrealized", "combined"], default: "combined" },
}, { _id: false });

const fundTrustReportSchema = new mongoose.Schema({
    fund: { type: mongoose.Schema.Types.ObjectId, ref: "InvestmentPlan", required: true, index: true },
    fundSnapshot: {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, trim: true },
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    reportDate: { ...dateString, required: true, index: true },
    reportTime: { type: String, required: true, trim: true },
    timezone: { type: String, required: true, trim: true, default: "sgt" },
    currencyCode: { type: String, enum: ["usd"], default: "usd" },
    summary: { type: String, default: "" },
    internalNotes: { type: String, default: "" },
    activity: { type: [activitySchema], default: [] },
    allocations: { type: [allocationSchema], default: [] },
    profits: { type: [profitSchema], default: [] },
    allocationSource: { type: String, default: "" },
    sourceReference: { type: String, trim: true, default: "" },
    methodology: { type: String, default: "" },
    feeBasis: { type: String, enum: ["gross", "net"], default: "net" },
    reviewer: { type: String, trim: true, default: "" },
    disclosure: { type: String, trim: true, default: "" },
    showPublicly: { type: Boolean, default: false, index: true },
    publishDate: dateString,
    publishTime: { type: String, trim: true, default: "" },
    revisionReason: { type: String, trim: true, default: "" },
    privacyThreshold: { type: String, trim: true, default: "standard" },
    checks: {
        type: [Boolean],
        default: [false, false, false, false],
        validate: {
            validator: (checks) => Array.isArray(checks) && checks.length === 4,
            message: "Exactly four publication checks are required.",
        },
    },
    publishedAt: { type: Date, default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, versionKey: false });

fundTrustReportSchema.index({ status: 1, updatedAt: -1 });
fundTrustReportSchema.index({ fund: 1, status: 1, reportDate: -1 });
fundTrustReportSchema.index({ title: "text", "fundSnapshot.name": "text" });

fundTrustReportSchema.pre("validate", function normalizeVisibility(next) {
    this.showPublicly = this.status === "published";
    if (this.status === "published" && !this.publishedAt) this.publishedAt = new Date();
    if (this.status === "draft") this.publishedAt = null;
    next();
});

module.exports = mongoose.models.FundTrustReport
    || mongoose.model("FundTrustReport", fundTrustReportSchema);
