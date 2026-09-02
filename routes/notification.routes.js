const express = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const { listNotifications, getNotification, updateReadState } = require("../controller/notification.controller");

const router = express.Router();
const adminOnly = [authenticate, requireRole(["admin", "superadmin"])];

router.get("/", ...adminOnly, listNotifications);
router.patch("/read", ...adminOnly, updateReadState);
router.get("/:id", ...adminOnly, getNotification);

module.exports = router;
