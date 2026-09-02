const express    = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole  = require("../middleware/role.middleware");

const {
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
} = require("../controller/portfolio.controller");

const router = express.Router();

// ── Client routes (authenticated) ─────────────────────────────────────────────

// Generate a quote — does NOT create anything
router.post("/confirm", authenticate, confirmPortfolioController);

// Create portfolio from confirmed quote — debits wallet and creates portfolio
router.post("/create", authenticate, createPortfolioController);

// List my portfolios (paginated + summary)
router.get("/my", authenticate, getMyPortfoliosController);

// ── Admin routes ───────────────────────────────────────────────────────────────

// Must come BEFORE /:id to avoid route conflicts
router.get(
    "/admin/list",
    authenticate,
    requireRole(["admin", "superadmin", "agent"]),
    getAdminPortfolioListController
);

router.get(
    "/admin/payout-summary",
    authenticate,
    requireRole(["admin", "superadmin"]),
    getAdminPortfolioPayoutSummaryController
);

router.delete(
    "/admin/delete-all",
    authenticate,
    requireRole(["superadmin"]),
    deleteAllPortfoliosController
);

router.delete(
    "/admin/client/:clientId",
    authenticate,
    requireRole(["superadmin"]),
    deleteClientPortfoliosController
);

router.get(
    "/admin/detail/:id",
    authenticate,
    requireRole(["admin", "superadmin", "agent"]),
    getPortfolioDetailAdminController
);

router.patch(
    "/admin/:id/status",
    authenticate,
    requireRole(["admin", "superadmin"]),
    updatePortfolioStatusController
);

router.delete(
    "/admin/:id",
    authenticate,
    requireRole(["superadmin"]),
    deleteSinglePortfolioController
);

// ── Parameterized client routes ────────────────────────────────────────────────

// Full portfolio detail with all lots
router.get("/:id", authenticate, getPortfolioByIdController);

// Pay next SIP installment
router.post("/:id/pay-sip", authenticate, payNextSipInstallmentController);

// Claim maturity payout — converts total USD value to chosen crypto and credits wallet
router.post("/:id/claim-maturity", authenticate, claimMaturityController);

// Early exit — returns principal (+accrued profit for maturity plans) minus penalty
router.post("/:id/early-exit", authenticate, earlyExitController);

// Claim monthly interest — available after 1 complete month, min $50 claimable
router.post("/:id/claim-monthly", authenticate, claimMonthlyInterestController);

module.exports = router;
