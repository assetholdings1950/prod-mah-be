const express    = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole  = require("../middleware/role.middleware");
const { getActivityLogsController } = require("../controller/activityLog.controller");

const router = express.Router();

router.get("/", authenticate, requireRole(["admin", "superadmin", "agent"]), getActivityLogsController);

module.exports = router;
