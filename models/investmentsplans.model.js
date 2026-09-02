const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const investmentPlanSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        slug: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            index: true,
        },

        shortDescription: {
            type: String,
            trim: true,
            default: "",
        },

        description: {
            type: String,
            trim: true,
            default: "",
        },

        photourl: {
            type: String,
            trim: true,
            default: "",
        },

        category: {
            type: String,
            enum: ["monthly", "lumpsum", "crypto"],
            required: true,
            index: true,
        },

        minAmount: {
            type: Number,
            required: function () { return this.category !== "crypto"; },
            min: 0,
            default: null,
        },

        maxAmount: {
            type: Number,
            required: function () { return this.category !== "crypto"; },
            min: 0,
            default: null,
        },

        currency: {
            type: String,
            enum: ["USD"],
            default: "USD",
        },

        roiType: {
            type: String,
            enum: ["fixed", "range"],
            required: true,
        },

        roiMin: {
            type: Number,
            required: true,
            min: 0,
        },

        roiMax: {
            type: Number,
            min: 0,
            default: null,
        },

        roiPeriod: {
            type: String,
            enum: ["annum"],
            default: "annum",
        },

        payoutType: {
            type: String,
            enum: ["monthly", "quarterly", "maturity"],
            required: true,
        },

        durationMinMonths: {
            type: Number,
            required: true,
            min: 1,
        },

        durationMaxMonths: {
            type: Number,
            required: true,
            min: 1,
        },

        lockInMonths: {
            type: Number,
            min: 0,
            default: 0,
        },

        exitPenaltyPercent: {
            type: Number,
            min: 0,
            max: 100,
            default: 0,
        },

        riskLevel: {
            type: String,
            enum: ["low", "medium", "high", "very_high"],
            required: true,
            index: true,
        },

        termsAndConditions: {
            type: String,
            trim: true,
            default: "",
        },

        status: {
            type: String,
            enum: ["draft", "active", "inactive"],
            default: "draft",
            index: true,
        },

        featured: {
            type: Boolean,
            default: false,
        },

        sortOrder: {
            type: Number,
            default: 0,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// PLUGINS
investmentPlanSchema.plugin(mongoosePaginate);
investmentPlanSchema.plugin(aggregatePaginate);

// INDEXES
investmentPlanSchema.index({ name: "text", slug: "text" });
investmentPlanSchema.index({ status: 1, category: 1 });
investmentPlanSchema.index({ featured: 1, sortOrder: 1 });

const investmentPlanModel =
    mongoose.models.InvestmentPlan ||
    mongoose.model("InvestmentPlan", investmentPlanSchema);

module.exports = investmentPlanModel;