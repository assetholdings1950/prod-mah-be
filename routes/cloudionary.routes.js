const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");

const {
    generateAdminAssetSignature,
    generateHiringSignature,
    generateSignatureForSubFolder,
} = require("../controller/cloudionary.controller");

const router = express.Router();

router.post("/hiring", generateHiringSignature);
router.post("/admin-upload", authenticate, requireRole(["admin", "superadmin"]), generateAdminAssetSignature);
router.post("/", authenticate, generateSignatureForSubFolder);

router.use(commonErrors);

module.exports = router;
