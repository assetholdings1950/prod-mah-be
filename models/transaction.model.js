const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const transactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "userModel",
            index: true,
        },

        userModel: {
            type: String,
            required: true,
            enum: ["User", "Agent", "Client"],
            default: "Client",
        },

        type: {
            type: String,
            enum: ["deposit", "withdrawal", "investment", "earning", "penalty", "charge"],
            required: true,
            index: true,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        currency: {
            type: String,
            trim: true,
            default: "USD",
        },

        usdAmount: { type: Number, default: null },
        rateToUsd: { type: Number, default: null },
        rateSource: { type: String, trim: true, default: null },
        convertedAt: { type: Date, default: null },

        status: {
            type: String,
            enum: ["pending", "completed", "failed"],
            default: "completed",
            index: true,
        },

        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        description: {
            type: String,
            trim: true,
            default: "",
        },

        createdBy: {
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

transactionSchema.plugin(mongoosePaginate);
transactionSchema.plugin(aggregatePaginate);

transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ referenceId: 1 });

const transactionModel =
    mongoose.models.Transaction ||
    mongoose.model("Transaction", transactionSchema);

module.exports = transactionModel;
