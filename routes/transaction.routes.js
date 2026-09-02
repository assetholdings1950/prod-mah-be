const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    adminTransactionListController,
    adminTransactionSummaryController,
    adminUserWalletController,
    getUserWalletBalancesController,
    clientTransactionListController,
    deleteAllTransactionsController,
    deleteUserTransactionsController,
    resetFundBalancesController,
} = require("../controller/transaction.controller");

const router = express.Router();

router.delete("/admin/delete-all", authenticate, requireRole(["superadmin"]), deleteAllTransactionsController);
router.delete("/admin/user-transactions", authenticate, requireRole(["superadmin"]), deleteUserTransactionsController);
router.patch("/admin/reset-fund-balances", authenticate, requireRole(["superadmin"]), resetFundBalancesController);
router.get("/admin/summary", authenticate, requireRole(["admin", "superadmin"]), adminTransactionSummaryController);
router.get("/admin/user-wallet", authenticate, requireRole(["admin", "superadmin"]), adminUserWalletController);
router.get("/admin/fund-balances", authenticate, getUserWalletBalancesController);
router.get("/admin", authenticate, requireRole(["admin", "superadmin"]), adminTransactionListController);
router.get("/client", authenticate, clientTransactionListController);

router.use(commonErrors);

module.exports = router;
