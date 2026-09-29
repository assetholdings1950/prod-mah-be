const Transaction = require("../models/transaction.model");
const Client = require("../models/client.model");
const Agent = require("../models/agent.model");
const UserWallet = require("../models/userWallet.model");
const ClientPortfolio = require("../models/clientPortfolio.model");
const { getEffectiveTierPolicy } = require("./commissionTierPolicy.service");

async function getInvestmentUsdValue(investment) {
    // The transaction amount is the crypto quantity paid. A portfolio lot is
    // the authoritative record of the corresponding USD investment value.
    const portfolio = await ClientPortfolio.findOne({
        _id: investment.referenceId,
        clientId: investment.userId,
    }).select("amountUsd lots").lean();
    const lot = portfolio?.lots?.find((item) =>
        item.walletTransactionId && String(item.walletTransactionId) === String(investment._id),
    );
    const value = Number(lot?.amountUsd ?? portfolio?.amountUsd ?? investment.usdAmount ?? 0);
    return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Credit exactly one commission for a completed client investment. The
 * investment transaction id is the idempotency key, so retries cannot pay an
 * account manager twice. Historical entries are intentionally untouched.
 */
async function creditCommissionForCompletedInvestment(investmentTransactionId) {
    const investment = await Transaction.findOne({
        _id: investmentTransactionId,
        userModel: "Client",
        type: "investment",
        status: "completed",
    }).lean();
    if (!investment) return { credited: false, reason: "investment_not_completed" };

    const client = await Client.findById(investment.userId).select("accountManager agent").lean();
    if (!client) return { credited: false, reason: "client_not_found" };

    // Legacy referrals stored only `agent`. When one of those clients next
    // invests, formalize that referrer as account manager before paying the
    // commission. New registrations set accountManager at creation time.
    const accountManagerId = client.accountManager || client.agent;
    if (!accountManagerId) return { credited: false, reason: "no_account_manager" };
    if (!client.accountManager && client.agent) {
        await Client.updateOne(
            { _id: client._id, accountManager: null },
            { $set: { accountManager: client.agent, accountManagerAssignedAt: new Date(), accountManagerAssignedBy: null } },
        );
    }

    const agent = await Agent.findOne({
        _id: accountManagerId,
        status: "active",
        isCommissionEligible: true,
    });
    if (!agent) return { credited: false, reason: "account_manager_not_eligible" };

    const alreadyCredited = await Transaction.exists({
        userId: agent._id,
        userModel: "Agent",
        type: "earning",
        referenceId: investment._id,
    });
    if (alreadyCredited) return { credited: false, reason: "already_credited" };

    const commissionBaseUsd = await getInvestmentUsdValue(investment);
    if (!commissionBaseUsd) return { credited: false, reason: "investment_usd_value_missing" };

    const policy = await getEffectiveTierPolicy(agent);
    if (!policy) return { credited: false, reason: "no_active_policy" };

    const rate = Number(policy.commissionRate);
    const amount = Number((commissionBaseUsd * (rate / 100)).toFixed(2));
    if (!(amount > 0)) return { credited: false, reason: "zero_commission" };

    const currency = "USD";
    try {
        await Transaction.create({
            userId: agent._id,
            userModel: "Agent",
            type: "earning",
            amount,
            currency,
            status: "completed",
            referenceId: investment._id,
            description: `Commission (${rate}% — ${policy.name}) on $${commissionBaseUsd.toFixed(2)} completed client investment.`,
            metadata: {
                commissionPolicyId: policy._id,
                commissionPolicyName: policy.name,
                commissionRate: rate,
                commissionRecipient: "account_manager",
                commissionBaseUsd,
                investmentTransactionId: investment._id,
                clientId: investment.userId,
            },
        });
    } catch (error) {
        // A concurrent retry may reach the duplicate check at the same time.
        if (error?.code === 11000) return { credited: false, reason: "already_credited" };
        throw error;
    }

    await UserWallet.findOneAndUpdate(
        { userId: agent._id, userModel: "Agent", currency },
        { $inc: { balance: amount } },
        { upsert: true, new: true },
    );

    // Keep the existing display fields compatible with the agent/admin UI.
    if (!agent.commissionTierPolicy || String(agent.commissionTierPolicy) !== String(policy._id)
        || agent.agentLevel !== policy.slug || Number(agent.commissionPercentage) !== rate) {
        await Agent.updateOne({ _id: agent._id }, {
            $set: { commissionTierPolicy: policy._id, agentLevel: policy.slug, commissionPercentage: rate },
        });
    }

    return { credited: true, agentId: agent._id, amount, currency, policy: policy.name, rate };
}

module.exports = { creditCommissionForCompletedInvestment };
