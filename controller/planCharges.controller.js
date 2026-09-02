const { getPlanChargesQuery, upsertPlanChargesQuery } = require("../query/planCharges.query");

const getPlanChargesController = async (req, res, next) => {
    try {
        const response = await getPlanChargesQuery(req.params.planId);
        return res.json(response);
    } catch (error) {
        next(error);
    }
};

const upsertPlanChargesController = async (req, res, next) => {
    try {
        const { planId, charges, adminId } = req.body;
        if (!planId) return res.status(400).json({ status: false, message: "planId is required." });
        const response = await upsertPlanChargesQuery({ planId, charges, adminId });
        return res.json(response);
    } catch (error) {
        next(error);
    }
};

module.exports = { getPlanChargesController, upsertPlanChargesController };
