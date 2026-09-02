const express = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const { commonErrors } = require("../errors/error");
const { getFinancialReportController } = require("../controller/report.controller");

const router = express.Router();

router.get("/financial", authenticate, requireRole(["admin", "superadmin"]), getFinancialReportController);

router.use(commonErrors);

module.exports = router;
