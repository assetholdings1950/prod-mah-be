const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const { adminDashboardSummaryController } = require("../controller/dashboard.controller");

const router = express.Router();

router.get("/summary", authenticate, requireRole(["admin", "superadmin"]), adminDashboardSummaryController);

router.use(commonErrors);

module.exports = router;
