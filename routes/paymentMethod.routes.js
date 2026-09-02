const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    createPaymentMethodController,
    paymentMethodListController,
    getPaymentMethodByIdController,
    activePaymentMethodsController,
    editPaymentMethodController,
    deletePaymentMethodController,
    togglePaymentMethodStatusController
} = require("../controller/paymentMethod.controller");

const router = express.Router();

// User - get active payment methods only
router.get("/", authenticate, activePaymentMethodsController);

// Admin - full CRUD
router.post("/admin", authenticate, requireRole(["admin", "superadmin"]), createPaymentMethodController);
router.get("/admin", authenticate, requireRole(["admin", "superadmin"]), paymentMethodListController);
router.get("/admin/:id", authenticate, requireRole(["admin", "superadmin"]), getPaymentMethodByIdController);
router.post("/admin/update", authenticate, requireRole(["admin", "superadmin"]), editPaymentMethodController);
router.patch("/admin/:id/toggle-status", authenticate, requireRole(["admin", "superadmin"]), togglePaymentMethodStatusController);
router.delete("/admin", authenticate, requireRole(["admin", "superadmin"]), deletePaymentMethodController);

router.use(commonErrors);

module.exports = router;
