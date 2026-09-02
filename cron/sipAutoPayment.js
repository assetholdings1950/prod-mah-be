const ClientPortfolio = require("../models/clientPortfolio.model");
const Client          = require("../models/client.model");
const { autoPaySipInstallmentService } = require("../services/portfolio.service");
const { addMonths } = require("../helpers/portfolio.helpers");
const { default: sendNotificationMail } = require("../emailTemplate/sendNotificationMail");
const SipInstallmentEvent = require("../models/sipInstallmentEvent.model");

const _fmt    = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

async function processSipAutoPayments() {
    const now = new Date();

    const due = await ClientPortfolio.find({
        investmentMode:    "sip",
        status:            "active",
        "sip.nextDueDate": { $lte: now },
        $expr: { $lt: ["$sip.paidInstallments", "$sip.totalInstallments"] },
    }).lean();

    if (!due.length) return { checked: 0, paid: 0, failed: 0 };

    let paid   = 0;
    let failed = 0;

    for (const portfolio of due) {
        const result = await autoPaySipInstallmentService(portfolio);

        const client = await Client.findById(portfolio.clientId, "email firstName").lean();
        const email  = client?.email;
        const name   = client?.firstName || "Investor";

        if (result.success) {
            paid++;
            if (email) {
                await sendNotificationMail({
                    to: email,
                    subject: `SIP Installment #${result.installmentNo} Processed | Merlion Asset Holdings`,
                    title: "SIP Installment Auto-Debited",
                    message: `Hi ${name}, installment <strong>#${result.installmentNo} of ${result.totalInstallments}</strong> for your SIP portfolio <strong>${portfolio.portfolioId}</strong> has been automatically processed.`,
                    details: [
                        { label: "Portfolio ID",       value: portfolio.portfolioId },
                        { label: "Plan",               value: portfolio.planSnapshot?.name || "Investment Plan" },
                        { label: "Installment",        value: `#${result.installmentNo} of ${result.totalInstallments}` },
                        { label: "Amount Debited",     value: `${Number(result.convertedAmount).toFixed(6)} ${result.currency}` },
                        { label: "USD Equivalent",     value: `$${_fmt(result.amountUsd)} USD` },
                        { label: "Wallet Used",        value: `${result.currency} Wallet${result.primaryWalletUsed ? " (Primary)" : " (Fallback)"}` },
                        ...(result.nextDueDate
                            ? [{ label: "Next Installment", value: _fmtDate(result.nextDueDate) }]
                            : [{ label: "Status", value: "All installments complete" }]
                        ),
                    ],
                });
            }
            console.log(`[SIP Auto-Pay] Paid #${result.installmentNo} for ${portfolio.portfolioId} via ${result.currency}`);
        } else {
            failed++;

            // A due installment is marked missed only after auto-pay has tried
            // every supported wallet and confirmed that none has enough funds.
            // Advance from the scheduled due date so late processing does not
            // shift the client's recurring billing day.
            if (result.reason === "insufficient_balance") {
                const nextDueDate = addMonths(new Date(portfolio.sip.nextDueDate), 1);
                const missedInstallments = (portfolio.sip?.missedInstallments ?? 0) + 1;
                const paidInstallments   = portfolio.sip?.paidInstallments ?? 0;
                const totalInstallments  = portfolio.sip?.totalInstallments ?? 0;

                const missedUpdate = await ClientPortfolio.updateOne(
                    {
                        _id: portfolio._id,
                        status: "active",
                        "sip.nextDueDate": portfolio.sip.nextDueDate,
                    },
                    {
                        $inc: { "sip.missedInstallments": 1 },
                        $set: {
                            "sip.nextDueDate": nextDueDate,
                            ...(paidInstallments + missedInstallments >= totalInstallments && { status: "paused" }),
                        },
                    }
                );

                if (missedUpdate.modifiedCount === 1) {
                    await SipInstallmentEvent.create({
                        portfolioId: portfolio._id,
                        portfolioCode: portfolio.portfolioId,
                        clientId: portfolio.clientId,
                        eventType: "missed",
                        installmentNo: paidInstallments + missedInstallments,
                        amountUsd: portfolio.sip?.monthlyAmountUsd || portfolio.amountUsd,
                        dueDate: portfolio.sip.nextDueDate,
                        reason: "insufficient_balance",
                        walletsChecked: result.walletsChecked || 0,
                    });
                }
            } else if (result.reason === "processing_error") {
                await SipInstallmentEvent.create({
                    portfolioId: portfolio._id,
                    portfolioCode: portfolio.portfolioId,
                    clientId: portfolio.clientId,
                    eventType: "processing_error",
                    installmentNo: (portfolio.sip?.paidInstallments ?? 0) + 1,
                    amountUsd: portfolio.sip?.monthlyAmountUsd || portfolio.amountUsd,
                    dueDate: portfolio.sip?.nextDueDate,
                    reason: "processing_error",
                    walletsChecked: result.walletsChecked || 0,
                });
            }

            if (email) {
                await sendNotificationMail({
                    to: email,
                    subject: result.reason === "insufficient_balance"
                        ? "SIP Installment Missed | Merlion Asset Holdings"
                        : "SIP Auto-Payment Error | Merlion Asset Holdings",
                    title: "SIP Installment Could Not Be Processed",
                    message: result.reason === "insufficient_balance"
                        ? `Hi ${name}, we were unable to auto-debit your SIP installment for portfolio <strong>${portfolio.portfolioId}</strong>. None of your crypto wallets had sufficient balance. Please top up before the next due date to avoid further missed installments.`
                        : `Hi ${name}, we could not process the automatic SIP payment for portfolio <strong>${portfolio.portfolioId}</strong> because of a payment processing error. No funds were deducted and the installment was not marked missed.`,
                    details: [
                        { label: "Portfolio ID",   value: portfolio.portfolioId },
                        { label: "Plan",           value: portfolio.planSnapshot?.name || "Investment Plan" },
                        { label: "Installment",    value: `#${(portfolio.sip?.paidInstallments ?? 0) + 1} of ${portfolio.sip?.totalInstallments ?? 0}` },
                        { label: "Amount Due",     value: `$${_fmt(portfolio.amountUsd)} USD` },
                        { label: "Wallets Checked",value: result.walletsChecked || 0 },
                        { label: "Reason",         value: result.reason === "insufficient_balance"
                            ? "Insufficient balance in all wallets"
                            : "Payment processing error — no funds were deducted" },
                    ],
                });
            }
            console.log(`[SIP Auto-Pay] Missed for ${portfolio.portfolioId} — ${result.reason}`);
        }
    }

    return { checked: due.length, paid, failed };
}

module.exports = { processSipAutoPayments };
