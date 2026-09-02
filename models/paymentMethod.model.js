const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const paymentMethodSchema = new mongoose.Schema(
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

        type: {
            type: String,
            enum: ["fiat", "crypto"],
            required: true,
            index: true,
        },

        currency: {
            type: String,
            enum: ["USD", "BTC", "USDT", "ETH", "SOL", "TRX"],
            required: true,
        },

        network: {
            type: String,
            enum: ["bank", "TRC20", "ERC20", "BEP20", "SOL", "BTC", "Polygon"],
            required: true,
        },

        walletAddress: {
            type: String,
            trim: true,
            default: "",
        },

        accountDetails: {
            type: String,
            trim: true,
            default: "",
        },

        qrCodeUrl: {
            type: String,
            trim: true,
            default: "",
        },

        instructions: {
            type: String,
            trim: true,
            default: "",
        },

        minDeposit: {
            type: Number,
            min: 0,
            default: 0,
        },

        maxDeposit: {
            type: Number,
            min: 0,
            default: null,
        },

        processingTime: {
            type: String,
            trim: true,
            default: "",
        },

        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "inactive",
            index: true,
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

paymentMethodSchema.plugin(mongoosePaginate);
paymentMethodSchema.plugin(aggregatePaginate);

paymentMethodSchema.index({ name: "text", slug: "text" });
paymentMethodSchema.index({ status: 1, type: 1 });
paymentMethodSchema.index({ sortOrder: 1 });

const paymentMethodModel =
    mongoose.models.PaymentMethod ||
    mongoose.model("PaymentMethod", paymentMethodSchema);

module.exports = paymentMethodModel;
