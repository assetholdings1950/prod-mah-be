const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    createDepositRequestController,
    userDepositListController,
    getUserDepositByIdController,
    adminDepositListController,
    adminGetDepositByIdController,
    adminDepositSummaryController,
    approveDepositController,
    rejectDepositController,
    bulkApproveDepositsController,
    bulkRejectDepositsController,
    deleteDepositsController,
    deleteAllDepositsController
} = require("../controller/deposit.controller");

const router = express.Router();

// User routes
router.post("/", authenticate, createDepositRequestController);
router.get("/my", authenticate, userDepositListController);
router.get("/my/:id", authenticate, getUserDepositByIdController);

// Admin list + summary + delete
router.get("/admin", authenticate, requireRole(["admin", "superadmin"]), adminDepositListController);
router.get("/admin/summary", authenticate, requireRole(["admin", "superadmin"]), adminDepositSummaryController);
router.delete("/admin/delete-all", authenticate, requireRole(["superadmin"]), deleteAllDepositsController);
router.delete("/admin", authenticate, requireRole(["admin", "superadmin"]), deleteDepositsController);

// Bulk actions — must come before /:id routes to avoid param capture
router.patch("/admin/bulk-approve", authenticate, requireRole(["admin", "superadmin"]), bulkApproveDepositsController);
router.patch("/admin/bulk-reject", authenticate, requireRole(["admin", "superadmin"]), bulkRejectDepositsController);

// Single record actions
router.get("/admin/:id", authenticate, requireRole(["admin", "superadmin"]), adminGetDepositByIdController);
router.patch("/admin/:id/approve", authenticate, requireRole(["admin", "superadmin"]), approveDepositController);
router.patch("/admin/:id/reject", authenticate, requireRole(["admin", "superadmin"]), rejectDepositController);

router.use(commonErrors);

module.exports = router;
