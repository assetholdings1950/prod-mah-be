const mongoose = require("mongoose");

const bondCounterSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        value: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true, versionKey: false }
);

module.exports = mongoose.models.BondCounter || mongoose.model("BondCounter", bondCounterSchema);
