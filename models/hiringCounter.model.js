const mongoose = require("mongoose");

const hiringCounterSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        value: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true },
);

module.exports = mongoose.model("HiringCounter", hiringCounterSchema);

