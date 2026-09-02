const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const walletDetailSchema = new mongoose.Schema(
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

        network: {
            type: String,
            trim: true,
            required: true,
        },

        walletAddress: {
            type: String,
            trim: true,
            required: true,
        },

        label: {
            type: String,
            trim: true,
            default: null,
        },

        isPrimary: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

walletDetailSchema.plugin(mongoosePaginate);
walletDetailSchema.plugin(aggregatePaginate);

walletDetailSchema.index({ userId: 1, userModel: 1 });
walletDetailSchema.index({ userId: 1, isPrimary: 1 });

const walletDetailModel =
    mongoose.models.WalletDetail || mongoose.model("WalletDetail", walletDetailSchema);

module.exports = walletDetailModel;
