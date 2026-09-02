const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    registerClientController,
    verifyClientOtpController,
    resendClientOtpController,
    clientListController,
    editClientController,
    deleteClientController,
    authController,
    getClientByIdController,
    forgotPasswordClientController,
    refreshClientController,
    logoutClientController,
    submitKycClientController,
    approveKycClientController,
    rejectKycClientController,
    bulkApproveKycController,
    bulkRejectKycController,
    resetPortfolioValueController,
    assignAccountManagerController,
} = require("../controller/client.controller");
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

const router = express.Router();

// Client auth
router.post("/sign-in", authController);
router.post("/", registerClientController);
router.post("/verify-otp", verifyClientOtpController);
router.post("/resend-otp", resendClientOtpController);
router.post("/forgot-password", forgotPasswordClientController);
router.post("/refresh", refreshClientController);
router.post("/logout", logoutClientController);

// Client KYC (client submits their own docs)
router.post("/submit-kyc", authenticate, submitKycClientController);

// Admin KYC actions
router.post("/approve-kyc/:id", authenticate, requireRole(["admin", "superadmin"]), approveKycClientController);
router.post("/reject-kyc/:id", authenticate, requireRole(["admin", "superadmin"]), rejectKycClientController);
router.post("/bulk-approve-kyc", authenticate, requireRole(["admin", "superadmin"]), bulkApproveKycController);
router.post("/bulk-reject-kyc", authenticate, requireRole(["admin", "superadmin"]), bulkRejectKycController);
router.patch("/admin/reset-portfolio-value", authenticate, requireRole(["superadmin"]), resetPortfolioValueController);
router.patch("/:id/account-manager", authenticate, requireRole(["admin", "superadmin"]), assignAccountManagerController);

// Admin CRUD
router.get("/", clientListController);
router.post("/update", editClientController);
router.delete("/", deleteClientController);

// Bank details — static routes before /:id
router.post("/bank-details", authenticate, (req, res, next) => {
    req.userModel = "Client";
    next();
}, addBankDetailController);

router.put("/bank-details/update", authenticate, updateBankDetailController);

router.delete("/bank-details/:id", authenticate, deleteBankDetailController);

// Wallets — static routes before /:id
router.post("/wallets", authenticate, (req, res, next) => {
    req.userModel = "Client";
    next();
}, addWalletController);

router.put("/wallets/update", authenticate, updateWalletController);

router.delete("/wallets/:id", authenticate, deleteWalletController);

// Single client by MongoDB _id (must come last to avoid capturing static segments)
router.get("/:id/bank-details", authenticate, (req, res, next) => {
    req.userModel = "Client";
    next();
}, getBankDetailsByUserIdController);

router.get("/:id/wallets", authenticate, (req, res, next) => {
    req.userModel = "Client";
    next();
}, getWalletsByUserIdController);

router.get("/:id", authenticate, getClientByIdController);

router.use(commonErrors);

module.exports = router;
