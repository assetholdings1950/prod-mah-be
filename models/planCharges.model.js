const mongoose = require("mongoose");

const chargeSchema = new mongoose.Schema(
    {
        particular:    { type: String, required: true, trim: true },
        chargePercent: { type: Number, required: true, min: 0, max: 100 },
    },
    { _id: false }
);

const planChargesSchema = new mongoose.Schema(
    {
        planId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "InvestmentPlan",
            required: true,
            unique:   true,
            index:    true,
        },
        charges:   { type: [chargeSchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    {
        timestamps: true,
        versionKey: false,
        collection: "plan_charges",
    }
);

const PlanCharges =
    mongoose.models.PlanCharges || mongoose.model("PlanCharges", planChargesSchema);

module.exports = PlanCharges;
