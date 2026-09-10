/**
 * Commission Tiers (SIP) — single source of truth.
 *
 * Agent commission on a SIP (monthly) sale is determined by the *amount* of that
 * individual sale:
 *
 *   up to $5,000            -> 2%
 *   $5,001  – $10,000       -> 5%
 *   $10,001 – $25,000       -> 7.5%
 *   greater than $25,000    -> 10%
 *
 * The agent portal dashboard renders its "Commission Tiers (SIP)" panel from the
 * mirror of this table at prod-mah-agent/src/config/commissionTiers.ts — keep the
 * two in sync when editing.
 */

// Ordered ascending by `min`. `max` is inclusive; `null` means "no upper bound".
const SIP_COMMISSION_TIERS = [
    { level: "basic", label: "Basic Partner", min: 0, max: 5000, rate: 2 },
    { level: "silver", label: "Silver Partner", min: 5000.01, max: 10000, rate: 5 },
    { level: "gold", label: "Gold Partner", min: 10000.01, max: 25000, rate: 7.5 },
    { level: "diamond", label: "Diamond Partner", min: 25000.01, max: null, rate: 10 },
];

const DEFAULT_SIP_RATE = SIP_COMMISSION_TIERS[0].rate;

/**
 * Resolve the SIP tier for a given sale amount.
 * @param {number} amount
 * @returns {{ level: string, label: string, min: number, max: number|null, rate: number }}
 */
function resolveSipTier(amount) {
    const value = Number(amount) || 0;
    for (const tier of SIP_COMMISSION_TIERS) {
        if (value >= tier.min && (tier.max === null || value <= tier.max)) {
            return tier;
        }
    }
    // Amount above every defined tier (shouldn't happen given the open-ended last tier).
    return SIP_COMMISSION_TIERS[SIP_COMMISSION_TIERS.length - 1];
}

/**
 * SIP commission rate (percentage) for a given sale amount.
 * @param {number} amount
 * @returns {number}
 */
function resolveSipRate(amount) {
    return resolveSipTier(amount).rate;
}

module.exports = {
    SIP_COMMISSION_TIERS,
    DEFAULT_SIP_RATE,
    resolveSipTier,
    resolveSipRate,
};
