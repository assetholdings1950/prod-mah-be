const PlanCharges = require("../models/planCharges.model");

const getPlanChargesQuery = async (planId) => {
    const doc = await PlanCharges.findOne({ planId }).lean();
    return {
        status:  true,
        planId,
        charges: doc?.charges ?? [],
    };
};

const upsertPlanChargesQuery = async ({ planId, charges, adminId }) => {
    const doc = await PlanCharges.findOneAndUpdate(
        { planId },
        {
            $set: {
                charges:   charges ?? [],
                updatedBy: adminId ?? null,
            },
            $setOnInsert: {
                createdBy: adminId ?? null,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return {
        status:  true,
        message: "Plan charges saved.",
        charges: doc.charges,
    };
};

module.exports = { getPlanChargesQuery, upsertPlanChargesQuery };
