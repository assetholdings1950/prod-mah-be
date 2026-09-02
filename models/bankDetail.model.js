const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");

const bankDetailSchema = new mongoose.Schema(
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

        bankName: {
            type: String,
            trim: true,
            default: null,
        },

        branchName: {
            type: String,
            trim: true,
            default: null,
        },

        accountName: {
            type: String,
            trim: true,
            default: null,
        },

        accountNumber: {
            type: String,
            trim: true,
            required: true,
        },

        ifscCode: {
            type: String,
            trim: true,
            uppercase: true,
            default: null,
        },

        swiftCode: {
            type: String,
            trim: true,
            uppercase: true,
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

bankDetailSchema.plugin(mongoosePaginate);
bankDetailSchema.plugin(aggregatePaginate);

bankDetailSchema.index({ userId: 1, userModel: 1 });
bankDetailSchema.index({ userId: 1, isPrimary: 1 });

const bankDetailModel =
    mongoose.models.BankDetail || mongoose.model("BankDetail", bankDetailSchema);

module.exports = bankDetailModel;
