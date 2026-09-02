const mongoose = require("mongoose");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const mongoosePaginate = require("mongoose-paginate-v2");

const referralSchema = new mongoose.Schema({

    referrerType: {
        type: String,
        enum: ["Agent", "Client"],
        required: true
    },

    referrer: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: "referrerType",
        index: true
    },

    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client",
        required: true,
        index: true
    },

    referralCodeUsed: { type: String, required: true, index: true }

}, {
    timestamps: true
});

referralSchema.plugin(mongoosePaginate)
referralSchema.plugin(aggregatePaginate)

module.exports = mongoose.model("Referal", referralSchema)