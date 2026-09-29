const CommissionTierPolicy = require("../models/commissionTierPolicy.model");
const Agent = require("../models/agent.model");
const { ensureDefaultTierPolicies } = require("../services/commissionTierPolicy.service");

const toSlug = (value) => String(value || "")
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const listCommissionTierPoliciesController = async (_req, res, next) => {
    try {
        await ensureDefaultTierPolicies();
        const policies = await CommissionTierPolicy.find().sort({ isDefault: -1, commissionRate: 1, createdAt: 1 }).lean();
        return res.send({ status: true, statusCode: 200, policies });
    } catch (error) { return next(error); }
};

const createCommissionTierPolicyController = async (req, res, next) => {
    try {
        const name = String(req.body.name || "").trim();
        const commissionRate = Number(req.body.commissionRate);
        if (!name || !Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
            return res.status(400).send({ status: false, message: "Name and a commission rate between 0 and 100 are required." });
        }
        const slug = toSlug(req.body.slug || name);
        if (!slug) return res.status(400).send({ status: false, message: "Enter a valid policy name." });
        if (req.body.isDefault) await CommissionTierPolicy.updateMany({}, { $set: { isDefault: false } });
        const policy = await CommissionTierPolicy.create({
            name, slug, commissionRate, active: req.body.active !== false,
            isDefault: Boolean(req.body.isDefault), description: String(req.body.description || "").trim(),
            createdBy: req.user.sub, updatedBy: req.user.sub,
        });
        return res.status(201).send({ status: true, statusCode: 201, policy });
    } catch (error) {
        if (error?.code === 11000) return res.status(409).send({ status: false, message: "A policy with this name already exists." });
        return next(error);
    }
};

const updateCommissionTierPolicyController = async (req, res, next) => {
    try {
        const policy = await CommissionTierPolicy.findById(req.params.id);
        if (!policy) return res.status(404).send({ status: false, message: "Commission tier policy not found." });
        const { name, commissionRate, active, isDefault, description } = req.body;
        if (name !== undefined) { policy.name = String(name).trim(); policy.slug = toSlug(name); }
        if (commissionRate !== undefined) {
            const rate = Number(commissionRate);
            if (!Number.isFinite(rate) || rate < 0 || rate > 100) return res.status(400).send({ status: false, message: "Commission rate must be between 0 and 100." });
            policy.commissionRate = rate;
        }
        if (active !== undefined) policy.active = Boolean(active);
        if (description !== undefined) policy.description = String(description || "").trim();
        if (isDefault === true) {
            await CommissionTierPolicy.updateMany({ _id: { $ne: policy._id } }, { $set: { isDefault: false } });
            policy.isDefault = true;
        } else if (isDefault === false) {
            policy.isDefault = false;
        }
        policy.updatedBy = req.user.sub;
        await policy.save();

        // Keep existing dashboards in sync immediately. This does not modify
        // earned commission transactions, whose policy/rate is snapshotted.
        await Agent.updateMany(
            { commissionTierPolicy: policy._id },
            { $set: { agentLevel: policy.slug, commissionPercentage: Number(policy.commissionRate) } },
        );
        return res.send({ status: true, statusCode: 200, policy });
    } catch (error) {
        if (error?.code === 11000) return res.status(409).send({ status: false, message: "A policy with this name already exists." });
        return next(error);
    }
};

module.exports = { listCommissionTierPoliciesController, createCommissionTierPolicyController, updateCommissionTierPolicyController };
