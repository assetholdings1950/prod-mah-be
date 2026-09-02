const express    = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole  = require("../middleware/role.middleware");
const {
    getCronStatusController,
    getCronLogsController,
    deleteAllCronDataController,
    triggerCronController,
    triggerVercelCronController,
} = require("../controller/cron.controller");

const router = express.Router();

router.get("/status", authenticate, requireRole(["admin", "superadmin"]), getCronStatusController);
router.get("/logs",   authenticate, requireRole(["admin", "superadmin"]), getCronLogsController);
router.delete("/delete-all", authenticate, requireRole(["superadmin"]), deleteAllCronDataController);
router.post("/run/:name", authenticate, requireRole(["superadmin"]),      triggerCronController);
router.get("/vercel/master/:slot", triggerVercelCronController);

module.exports = router;
