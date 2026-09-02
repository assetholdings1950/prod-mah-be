const mongoose = require("mongoose");

const userWalletSchema = new mongoose.Schema(
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

        currency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
        },

        balance: {
            type: Number,
            default: 0,
            min: 0,
        },

        totalDeposited: {
            type: Number,
            default: 0,
            min: 0,
        },

        totalWithdrawn: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// one wallet document per user per currency
userWalletSchema.index({ userId: 1, userModel: 1, currency: 1 }, { unique: true });

const userWalletModel =
    mongoose.models.UserWallet ||
    mongoose.model("UserWallet", userWalletSchema);

module.exports = userWalletModel;
