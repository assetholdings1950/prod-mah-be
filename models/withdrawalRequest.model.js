const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const withdrawalRequestSchema = new mongoose.Schema(
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

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        currency: {
            type: String,
            required: true,
            trim: true,
            default: "USD",
        },

        withdrawalMethod: {
            type: String,
            required: true,
            enum: ["bank", "wallet"],
        },

        bankDetailId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BankDetail",
            default: null,
        },

        walletId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WalletDetail",
            default: null,
        },

        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
            index: true,
        },

        note: {
            type: String,
            trim: true,
            default: "",
        },

        adminNote: {
            type: String,
            trim: true,
            default: "",
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        approvedAt: {
            type: Date,
            default: null,
        },

        conversion: {
            usdAmount: { type: Number, default: null },
            rateToUsd: { type: Number, default: null },
            source: { type: String, default: null },
            convertedAt: { type: Date, default: null },
        },

        rejectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        rejectedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

withdrawalRequestSchema.plugin(mongoosePaginate);
withdrawalRequestSchema.plugin(aggregatePaginate);

withdrawalRequestSchema.index({ userId: 1, status: 1 });
withdrawalRequestSchema.index({ status: 1, currency: 1 });
withdrawalRequestSchema.index({ createdAt: -1 });

const withdrawalRequestModel =
    mongoose.models.WithdrawalRequest ||
    mongoose.model("WithdrawalRequest", withdrawalRequestSchema);

module.exports = withdrawalRequestModel;
