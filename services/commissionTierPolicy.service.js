const CommissionTierPolicy = require("../models/commissionTierPolicy.model");

// These seed policies preserve the existing displayed levels while moving the
// rate source into MongoDB, where administrators can manage it.
const DEFAULT_POLICIES = [
    { name: "Basic Partner", slug: "basic", commissionRate: 2, isDefault: true, description: "Default commission policy for new agents." },
    { name: "Silver Partner", slug: "silver", commissionRate: 5, description: "Silver commission policy." },
    { name: "Gold Partner", slug: "gold", commissionRate: 7.5, description: "Gold commission policy." },
    { name: "Diamond Partner", slug: "diamond", commissionRate: 10, description: "Diamond commission policy." },
];

async function ensureDefaultTierPolicies() {
    await Promise.all(DEFAULT_POLICIES.map((policy) => CommissionTierPolicy.updateOne(
        { slug: policy.slug },
        { $setOnInsert: { ...policy, active: true } },
        { upsert: true },
    )));
}

async function getDefaultTierPolicy() {
    await ensureDefaultTierPolicies();
    return CommissionTierPolicy.findOne({ active: true, isDefault: true })
        || CommissionTierPolicy.findOne({ active: true }).sort({ createdAt: 1 });
}

async function getEffectiveTierPolicy(agent) {
    await ensureDefaultTierPolicies();

    let policy = agent?.commissionTierPolicy
        ? await CommissionTierPolicy.findOne({ _id: agent.commissionTierPolicy, active: true })
        : null;

    // Existing agents are mapped lazily by their current legacy level. This
    // prevents a data migration from being required before future commissions.
    if (!policy && agent?.agentLevel) {
        policy = await CommissionTierPolicy.findOne({ slug: agent.agentLevel, active: true });
    }
    if (!policy) policy = await getDefaultTierPolicy();
    return policy;
}

module.exports = { DEFAULT_POLICIES, ensureDefaultTierPolicies, getDefaultTierPolicy, getEffectiveTierPolicy };
