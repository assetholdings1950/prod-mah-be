const ClientPortfolio = require("../models/clientPortfolio.model");
const Client          = require("../models/client.model");
const UserWallet      = require("../models/userWallet.model");
const { default: sendNotificationMail } = require("../emailTemplate/sendNotificationMail");
const { convertCurrency }               = require("../controller/currency.controller");

const SUPPORTED_CRYPTO = ["BTC", "ETH", "USDT", "SOL", "TRX"];

const _fmt    = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

async function sendSipReminders() {
    const now         = new Date();
    const windowStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const windowEnd   = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

    const upcoming = await ClientPortfolio.find({
        investmentMode:    "sip",
        status:            "active",
        "sip.nextDueDate": { $gte: windowStart, $lte: windowEnd },
        $expr: { $lt: ["$sip.paidInstallments", "$sip.totalInstallments"] },
    }).lean();

    if (!upcoming.length) return { checked: 0, reminded: 0 };

    let reminded = 0;

    for (const portfolio of upcoming) {
        const client = await Client.findById(portfolio.clientId, "email firstName").lean();
        if (!client?.email) continue;

        // Check each wallet's sufficiency for the installment
        const rawWallets = await UserWallet.find({
            userId:    portfolio.clientId,
            userModel: "Client",
            currency:  { $in: SUPPORTED_CRYPTO },
        }).lean();

        const walletDetails = await Promise.all(rawWallets.map(async (w) => {
            let sufficient = false;
            try {
                const conv = await convertCurrency("USD", w.currency, portfolio.amountUsd);
                sufficient = (w.balance || 0) >= conv.convertedAmount;
            } catch { /* skip */ }
            return { currency: w.currency, balance: w.balance || 0, sufficient };
        }));

        const hasSufficientWallet = walletDetails.some(w => w.sufficient);
        const installmentNo       = (portfolio.sip?.paidInstallments ?? 0) + 1;
        const name                = client.firstName || "Investor";

        await sendNotificationMail({
            to: client.email,
            subject: `Upcoming SIP Installment — Due ${_fmtDate(portfolio.sip.nextDueDate)} | Merlion Asset Holdings`,
            title: "SIP Installment Reminder",
            message: hasSufficientWallet
                ? `Hi ${name}, your next SIP installment for <strong>${portfolio.portfolioId}</strong> is due in 3 days. Your wallet has sufficient balance — no action needed.`
                : `Hi ${name}, your next SIP installment for <strong>${portfolio.portfolioId}</strong> is due in 3 days. None of your wallets currently have sufficient balance. Please top up before the due date to avoid a missed installment.`,
            details: [
                { label: "Portfolio ID",   value: portfolio.portfolioId },
                { label: "Plan",           value: portfolio.planSnapshot?.name || "Investment Plan" },
                { label: "Installment",    value: `#${installmentNo} of ${portfolio.sip?.totalInstallments ?? 0}` },
                { label: "Amount Due",     value: `$${_fmt(portfolio.amountUsd)} USD` },
                { label: "Due Date",       value: _fmtDate(portfolio.sip.nextDueDate) },
                // Wallet balance rows
                ...walletDetails.map(w => ({
                    label: `${w.currency} Wallet`,
                    value: `${Number(w.balance).toFixed(6)} ${w.currency} — ${w.sufficient ? "✓ Sufficient" : "✗ Insufficient"}`,
                })),
            ],
        });

        reminded++;
    }

    return { checked: upcoming.length, reminded };
}

module.exports = { sendSipReminders };
