const express = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    listCommissionTierPoliciesController,
    createCommissionTierPolicyController,
    updateCommissionTierPolicyController,
} = require("../controller/commissionTierPolicy.controller");

const router = express.Router();
const adminRoles = ["admin", "superadmin", "Admin", "Super-Admin"];

router.use(authenticate, requireRole(adminRoles));
router.get("/", listCommissionTierPoliciesController);
router.post("/", createCommissionTierPolicyController);
router.patch("/:id", updateCommissionTierPolicyController);

module.exports = router;
