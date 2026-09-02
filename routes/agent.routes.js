const express = require("express");
const {
    authController,
    createAgentByAdminController,
    verifyOtpController,
    resendOtpController,
    forgotPasswordController,
    refreshController,
    logoutController,
    submitKycController,
    approveKycController,
    agentListController,
    editAgentController,
    deleteAgentController,
    getAgentByIdController,
    getAgentProfileController,
    updateAgentProfileController,
} = require("../controller/agent.controller");
const {
    getBankDetailsByUserIdController,
    addBankDetailController,
    updateBankDetailController,
    deleteBankDetailController,
} = require("../controller/bankDetail.controller");
const {
    getWalletsByUserIdController,
    addWalletController,
    updateWalletController,
    deleteWalletController,
} = require("../controller/walletDetail.controller");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");

const router = express.Router();
const agentCreators = ["HR", "Hiring-Admin", "Hiring Admin", "Admin", "Super-Admin"];

// Auth
router.post("/sign-in", authController);
router.post("/sign-up", (_req, res) => {
    return res.status(403).json({
        status: false,
        message: "Agent accounts are created by the Merlion administration team."
    });
});
router.post("/verify-otp", verifyOtpController);
router.post("/resend-otp", resendOtpController);
router.post("/forgot-password", forgotPasswordController);
router.post("/refresh", refreshController);
router.post("/logout", logoutController);
router.post("/submit-kyc", authenticate, submitKycController);
router.post("/approve-kyc", authenticate, requireRole(["Super-Admin", "Admin"]), approveKycController);
router.get("/profile", authenticate, getAgentProfileController);
router.put("/profile", authenticate, updateAgentProfileController);

// ─── Agent self-service payout destinations (mobile app) ────────────────────
// An authenticated agent manages their OWN bank/wallet records. userId & model
// are taken from the JWT, never the request body, so an agent can only ever
// touch their own payout destinations.
router.get("/me/bank-details", authenticate, (req, res, next) => {
    req.userModel = "Agent";
    req.params.id = req.user.sub;
    next();
}, getBankDetailsByUserIdController);

router.post("/me/bank-details", authenticate, (req, res, next) => {
    req.userModel = "Agent";
    req.body.userId = req.user.sub;
    next();
}, addBankDetailController);

router.get("/me/wallets", authenticate, (req, res, next) => {
    req.userModel = "Agent";
    req.params.id = req.user.sub;
    next();
}, getWalletsByUserIdController);

router.post("/me/wallets", authenticate, (req, res, next) => {
    req.userModel = "Agent";
    req.body.userId = req.user.sub;
    next();
}, addWalletController);

// Agent Verification
router.get("/verify/:agentId", async (req, res) => {
    try {
        const agentIdParam = req.params.agentId;
        const agent = await require("../models/agent.model").findOne({
            $or: [
                { agentId: agentIdParam },
                { agentId: agentIdParam.startsWith('#') ? agentIdParam : `#${agentIdParam}` }
            ]
        });
        if (!agent) {
            return res.status(404).json({ success: false, message: "Agent not found" });
        }
        
        res.status(200).json({
            success: true,
            data: {
                agentId: agent.agentId,
                fullName: agent.fullName || "Verified Agent",
                performance: {
                    rating: 4.9,
                    records: "Top 10% Performer",
                    totalClientInvestment: 1500000
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin CRUD
router.post(
    "/admin/create",
    authenticate,
    requireRole(agentCreators),
    createAgentByAdminController
);
router.get("/", agentListController);
router.post("/update", editAgentController);
router.delete("/", deleteAgentController);

// Bank details — static routes before /:id
router.post("/bank-details", authenticate, requireRole(["admin", "superadmin"]), (req, res, next) => {
    req.userModel = "Agent";
    next();
}, addBankDetailController);

router.put("/bank-details/update", authenticate, requireRole(["admin", "superadmin"]), updateBankDetailController);

router.delete("/bank-details/:id", authenticate, requireRole(["admin", "superadmin"]), deleteBankDetailController);

// Wallets — static routes before /:id
router.post("/wallets", authenticate, requireRole(["admin", "superadmin"]), (req, res, next) => {
    req.userModel = "Agent";
    next();
}, addWalletController);

router.put("/wallets/update", authenticate, requireRole(["admin", "superadmin"]), updateWalletController);

router.delete("/wallets/:id", authenticate, requireRole(["admin", "superadmin"]), deleteWalletController);

// By agent _id (must come last)
router.get("/:id/bank-details", authenticate, requireRole(["admin", "superadmin"]), (req, res, next) => {
    req.userModel = "Agent";
    next();
}, getBankDetailsByUserIdController);

router.get("/:id/wallets", authenticate, requireRole(["admin", "superadmin"]), (req, res, next) => {
    req.userModel = "Agent";
    next();
}, getWalletsByUserIdController);

router.get("/:id", authenticate, requireRole(["admin", "superadmin"]), getAgentByIdController);

router.use(commonErrors);

module.exports = router;
