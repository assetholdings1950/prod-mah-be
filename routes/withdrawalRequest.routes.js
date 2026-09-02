const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    createWithdrawalRequestController,
    userWithdrawalListController,
    getUserWithdrawalByIdController,
    adminWithdrawalListController,
    adminGetWithdrawalByIdController,
    withdrawalSummaryController,
    approveWithdrawalController,
    rejectWithdrawalController,
    bulkApproveWithdrawalsController,
    bulkRejectWithdrawalsController,
    deleteWithdrawalsController,
    deleteAllWithdrawalsController,
} = require("../controller/withdrawalRequest.controller");

const router = express.Router();

// User routes
router.post("/", authenticate, createWithdrawalRequestController);
router.get("/my", authenticate, userWithdrawalListController);
router.get("/my/:id", authenticate, getUserWithdrawalByIdController);

// Admin list + summary + delete
router.get("/admin", authenticate, requireRole(["admin", "superadmin"]), adminWithdrawalListController);
router.get("/admin/summary", authenticate, requireRole(["admin", "superadmin"]), withdrawalSummaryController);
router.delete("/admin/delete-all", authenticate, requireRole(["superadmin"]), deleteAllWithdrawalsController);
router.delete("/admin", authenticate, requireRole(["admin", "superadmin"]), deleteWithdrawalsController);

// Bulk actions — must come before /:id to avoid param capture
router.patch("/admin/bulk-approve", authenticate, requireRole(["admin", "superadmin"]), bulkApproveWithdrawalsController);
router.patch("/admin/bulk-reject", authenticate, requireRole(["admin", "superadmin"]), bulkRejectWithdrawalsController);

// Single record actions
router.get("/admin/:id", authenticate, requireRole(["admin", "superadmin"]), adminGetWithdrawalByIdController);
router.patch("/admin/:id/approve", authenticate, requireRole(["admin", "superadmin"]), approveWithdrawalController);
router.patch("/admin/:id/reject", authenticate, requireRole(["admin", "superadmin"]), rejectWithdrawalController);

router.use(commonErrors);

module.exports = router;
