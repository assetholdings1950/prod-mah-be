const asyncHandler = require("express-async-handler");
const ClientPortfolio = require("../models/clientPortfolio.model");
const UserWallet = require("../models/userWallet.model");
const Client = require("../models/client.model");
const { logActivity } = require("../utils/activityLogger");
const { ensureAccountOpeningApproved } = require("../query/accountOpeningForm.query");

const {
    confirmPortfolioService,
    createPortfolioService,
    getMyPortfoliosService,
    getPortfolioByIdService,
    payNextSipInstallmentService,
    updatePortfolioStatusService,
    claimMaturityService,
    earlyExitPortfolioService,
    claimMonthlyInterestService,
    getAdminPortfolioListService,
    getAdminPortfolioPayoutSummaryService,
} = require("../services/portfolio.service");

// ── POST /portfolio/confirm ───────────────────────────────────────────────────
// Returns a 10-minute locked conversion quote. No DB writes.
const confirmPortfolioController = asyncHandler(async (req, res) => {
    const { planId, amountUsd, paymentCurrency, durationMonths } = req.body;

    if (!planId || !amountUsd || !paymentCurrency || !durationMonths) {
        return res.status(400).json({
            status: false,
            message: "planId, amountUsd, paymentCurrency, and durationMonths are required.",
        });
    }

    try {
        const quote = await confirmPortfolioService({
            clientId: req.user.sub,
            planId,
            amountUsd:      parseFloat(amountUsd),
            paymentCurrency,
            durationMonths: parseInt(durationMonths, 10),
        });

        return res.status(200).json({ status: true, quote });

    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to generate quote." });
    }
});

// ── POST /portfolio/create ────────────────────────────────────────────────────
// Validates quote, checks balance, deducts wallet, creates portfolio.
const createPortfolioController = asyncHandler(async (req, res) => {
    const clientId  = req.user.sub;
    const {
        planId,
        amountUsd,
        paymentCurrency,
        durationMonths,
        cryptoAmount,
        rate,
        source,
        lockedAt,
        lockedUntil,
        convertedAt,
    } = req.body;

    const required = { planId, amountUsd, paymentCurrency, durationMonths, cryptoAmount, rate, lockedUntil };
    const missing  = Object.entries(required).filter(([, v]) => v == null || v === "").map(([k]) => k);

    if (missing.length > 0) {
        return res.status(400).json({
            status: false,
            message: `Missing required fields: ${missing.join(", ")}.`,
        });
    }

    try {
        const portfolio = await createPortfolioService({
            clientId,
            planId,
            amountUsd:      parseFloat(amountUsd),
            paymentCurrency,
            durationMonths: parseInt(durationMonths, 10),
            cryptoAmount:   parseFloat(cryptoAmount),
            rate:           parseFloat(rate),
            source:         source || "coingecko",
            lockedAt,
            lockedUntil,
            convertedAt,
        });

        logActivity({
            userId: clientId, userModel: "Client",
            action: "portfolio.created", category: "portfolio",
            description: `Portfolio created: $${amountUsd} USD for ${durationMonths} months`,
            metadata: { amountUsd, paymentCurrency, durationMonths },
            performedBy: { id: clientId, role: "Client" },
            notification: {
                title: "New portfolio investment created",
                priority: "medium",
                actionRequired: false,
                entity: { model: "ClientPortfolio", id: portfolio._id, reference: portfolio.portfolioId, label: "Portfolio", url: `/clients/${clientId}`, state: portfolio.status || "active" },
            },
        });

        return res.status(201).json({
            status:  true,
            message: "Investment created successfully.",
            data:    portfolio,
        });

    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to create portfolio." });
    }
});

// ── GET /portfolio/my ─────────────────────────────────────────────────────────
// Paginated list of authenticated client's portfolios with summary totals.
const getMyPortfoliosController = asyncHandler(async (req, res) => {
    const clientId = req.user.sub;
    const { status, category, investmentMode, page = 1, limit = 10 } = req.query;

    try {
        const result = await getMyPortfoliosService({ clientId, status, category, investmentMode, page, limit });

        return res.status(200).json({ status: true, ...result });

    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to fetch portfolios." });
    }
});

// ── GET /portfolio/:id ────────────────────────────────────────────────────────
// Full portfolio detail including all lots.
const getPortfolioByIdController = asyncHandler(async (req, res) => {
    const clientId    = req.user.sub;
    const portfolioId = req.params.id;

    try {
        const portfolio = await getPortfolioByIdService({ portfolioId, clientId });
        return res.status(200).json({ status: true, data: portfolio });

    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to fetch portfolio." });
    }
});

// ── POST /portfolio/:id/pay-sip ───────────────────────────────────────────────
// Pays the next SIP installment, adds a new lot to the portfolio.
const payNextSipInstallmentController = asyncHandler(async (req, res) => {
    const clientId    = req.user.sub;
    const portfolioId = req.params.id;
    const { paymentCurrency } = req.body;

    if (!paymentCurrency) {
        return res.status(400).json({ status: false, message: "paymentCurrency is required." });
    }

    try {
        const portfolio = await payNextSipInstallmentService({ portfolioId, clientId, paymentCurrency });

        return res.status(200).json({
            status:  true,
            message: "SIP installment paid successfully.",
            data:    portfolio,
        });

    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to pay SIP installment." });
    }
});

// ── PATCH /portfolio/:id/status (Admin) ───────────────────────────────────────
// Allows admins to pause, close, cancel, or mark a portfolio as matured.
const updatePortfolioStatusController = asyncHandler(async (req, res) => {
    const portfolioId = req.params.id;
    const adminId     = req.user.sub;
    const { status }  = req.body;

    if (!status) {
        return res.status(400).json({ status: false, message: "status is required." });
    }

    try {
        const portfolio = await updatePortfolioStatusService({ portfolioId, status, adminId });

        if (portfolio?.clientId) {
            logActivity({
                userId: portfolio.clientId, userModel: portfolio.userModel ?? "Client",
                action: "portfolio.status_updated", category: "portfolio",
                description: `Portfolio status changed to '${status}'`,
                metadata: { portfolioId, status },
                performedBy: { id: adminId, role: "admin" },
            });
        }

        return res.status(200).json({
            status:  true,
            message: `Portfolio status updated to '${status}'.`,
            data:    portfolio,
        });

    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to update portfolio status." });
    }
});

// ── POST /portfolio/:id/claim-maturity ────────────────────────────────────────
const claimMaturityController = asyncHandler(async (req, res) => {
    const clientId        = req.user.sub;
    const portfolioId     = req.params.id;
    const { paymentCurrency } = req.body;

    if (!paymentCurrency) {
        return res.status(400).json({ status: false, message: "paymentCurrency is required." });
    }

    try {
        await ensureAccountOpeningApproved(clientId);
        const result = await claimMaturityService({ portfolioId, clientId, paymentCurrency });
        return res.status(200).json({
            status:  true,
            message: "Maturity payout claimed successfully.",
            data:    result,
        });
    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to claim maturity payout." });
    }
});

// ── POST /portfolio/:id/early-exit ────────────────────────────────────────────
const earlyExitController = asyncHandler(async (req, res) => {
    const clientId            = req.user.sub;
    const portfolioId         = req.params.id;
    const { paymentCurrency } = req.body;

    if (!paymentCurrency) {
        return res.status(400).json({ status: false, message: "paymentCurrency is required." });
    }

    try {
        await ensureAccountOpeningApproved(clientId);
        const result = await earlyExitPortfolioService({ portfolioId, clientId, paymentCurrency });
        return res.status(200).json({
            status:  true,
            message: "Early exit processed successfully.",
            data:    result,
        });
    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to process early exit." });
    }
});

// ── POST /portfolio/:id/claim-monthly ─────────────────────────────────────────
const claimMonthlyInterestController = asyncHandler(async (req, res) => {
    const clientId            = req.user.sub;
    const portfolioId         = req.params.id;
    const { paymentCurrency } = req.body;

    if (!paymentCurrency) {
        return res.status(400).json({ status: false, message: "paymentCurrency is required." });
    }

    try {
        await ensureAccountOpeningApproved(clientId);
        const result = await claimMonthlyInterestService({ portfolioId, clientId, paymentCurrency });
        return res.status(200).json({
            status:  true,
            message: "Monthly interest claimed successfully.",
            data:    result,
        });
    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to claim monthly interest." });
    }
});

// ── GET /portfolio/admin/list (Admin) ─────────────────────────────────────────
const getAdminPortfolioListController = asyncHandler(async (req, res) => {
    const {
        page, limit, search, status, investmentMode, category, clientId,
        startDate, endDate, sortBy, sortOrder,
    } = req.query;

    // Agent security check: Agent can only list portfolios for one of their referred clients
    if (req.user && req.user.model === "Agent") {
        if (!clientId) {
            return res.status(400).json({ status: false, message: "clientId is required for Agent requests." });
        }
        const client = await Client.findById(clientId).select("agent").lean();
        if (!client || String(client.agent) !== String(req.user.sub)) {
            return res.status(403).json({ status: false, message: "Forbidden - Client is not registered under your referral network." });
        }
    }

    try {
        const result = await getAdminPortfolioListService({
            page: Number(page) || 1,
            limit: Number(limit) || 20,
            search, status, investmentMode, category, clientId,
            startDate, endDate, sortBy, sortOrder,
        });
        return res.status(200).json({ status: true, ...result });
    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to fetch portfolios." });
    }
});

// ── GET /portfolio/admin/payout-summary (Admin) ───────────────────────────────
const getAdminPortfolioPayoutSummaryController = asyncHandler(async (req, res) => {
    try {
        const summary = await getAdminPortfolioPayoutSummaryService();
        return res.status(200).json({ status: true, summary });
    } catch (err) {
        const code = err.status || 500;
        return res.status(code).json({ status: false, message: err.message || "Failed to fetch payout summary." });
    }
});

// ── GET /portfolio/admin/detail/:id (Admin) ───────────────────────────────────
const getPortfolioDetailAdminController = asyncHandler(async (req, res) => {
    const portfolio = await ClientPortfolio.findById(req.params.id).lean();
    if (!portfolio) {
        return res.status(404).json({ status: false, message: "Portfolio not found." });
    }

    // Agent security check: Agent can only view details of a portfolio owned by one of their clients
    if (req.user && req.user.model === "Agent") {
        const client = await Client.findById(portfolio.clientId).select("agent").lean();
        if (!client || String(client.agent) !== String(req.user.sub)) {
            return res.status(403).json({ status: false, message: "Forbidden - This portfolio belongs to a client not registered under your referral network." });
        }
    }

    return res.status(200).json({ status: true, data: portfolio });
});

// ── DELETE /portfolio/admin/client/:clientId (Super-admin) ───────────────────
const deleteClientPortfoliosController = asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    if (!clientId) {
        return res.status(400).json({ status: false, message: "clientId is required." });
    }
    const result = await ClientPortfolio.deleteMany({ clientId });
    return res.status(200).json({
        status: true,
        message: `${result.deletedCount} portfolio record(s) deleted for client.`,
        deletedCount: result.deletedCount,
    });
});

// ── DELETE /portfolio/admin/:id (Super-admin) ────────────────────────────────
const deleteSinglePortfolioController = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const portfolio = await ClientPortfolio.findById(id);
    if (!portfolio) {
        return res.status(404).json({ status: false, message: "Portfolio not found." });
    }

    // Build refund map: currency → total crypto amount to credit back
    // Sum across all lots so SIP multi-installment portfolios are fully refunded
    const refundMap = {};
    for (const lot of portfolio.lots ?? []) {
        refundMap[lot.paidCurrency] = (refundMap[lot.paidCurrency] ?? 0) + lot.paidAmount;
    }
    // Fallback for edge cases where lots array is empty (e.g. created but no lot added)
    if (Object.keys(refundMap).length === 0 && portfolio.paidFromWallet?.amount > 0) {
        refundMap[portfolio.paidFromWallet.currency] = portfolio.paidFromWallet.amount;
    }

    // Credit each currency wallet directly — no transaction record
    for (const [currency, amount] of Object.entries(refundMap)) {
        await UserWallet.findOneAndUpdate(
            { userId: portfolio.clientId, userModel: portfolio.userModel, currency },
            { $inc: { balance: amount } }
        );
    }

    await ClientPortfolio.findByIdAndDelete(id);

    logActivity({
        userId: portfolio.clientId, userModel: portfolio.userModel ?? "Client",
        action: "portfolio.deleted", category: "portfolio",
        description: "Portfolio deleted by admin with wallet refund",
        metadata: { portfolioId: id, refundMap },
        performedBy: { id: req.user.sub, role: "admin" },
    });

    return res.status(200).json({ status: true, message: "Portfolio deleted and wallet credited." });
});

// ── DELETE /portfolio/admin/delete-all (Super-admin) ──────────────────────────
const deleteAllPortfoliosController = asyncHandler(async (req, res) => {
    const result = await ClientPortfolio.deleteMany({});
    return res.status(200).json({
        status: true,
        message: `${result.deletedCount} portfolio record(s) deleted.`,
        deletedCount: result.deletedCount,
    });
});

module.exports = {
    confirmPortfolioController,
    createPortfolioController,
    getMyPortfoliosController,
    getPortfolioByIdController,
    payNextSipInstallmentController,
    updatePortfolioStatusController,
    claimMaturityController,
    earlyExitController,
    claimMonthlyInterestController,
    getAdminPortfolioListController,
    getAdminPortfolioPayoutSummaryController,
    deleteAllPortfoliosController,
    deleteClientPortfoliosController,
    getPortfolioDetailAdminController,
    deleteSinglePortfolioController,
};
