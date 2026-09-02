const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const depositRequestSchema = new mongoose.Schema(
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

        paymentMethodId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentMethod",
            required: true,
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
        },

        network: {
            type: String,
            trim: true,
            default: "",
        },

        transactionHash: {
            type: String,
            trim: true,
            default: "",
        },

        senderWalletAddress: {
            type: String,
            trim: true,
            default: "",
        },

        paymentProofUrl: {
            type: String,
            trim: true,
            default: "",
        },

        note: {
            type: String,
            trim: true,
            default: "",
        },

        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
            index: true,
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

depositRequestSchema.plugin(mongoosePaginate);
depositRequestSchema.plugin(aggregatePaginate);

depositRequestSchema.index({ userId: 1, status: 1 });
depositRequestSchema.index({ status: 1, currency: 1 });
depositRequestSchema.index({ paymentMethodId: 1 });
depositRequestSchema.index({ createdAt: -1 });

const depositRequestModel =
    mongoose.models.DepositRequest ||
    mongoose.model("DepositRequest", depositRequestSchema);

module.exports = depositRequestModel;
