const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    createBondController,
    listBondsController,
    getBondController,
    updateBondController,
    deleteBondsController,
} = require("../controller/bond.controller");

const router = express.Router();

router.use(authenticate, requireRole(["admin", "superadmin"]));

router.post("/", createBondController);
router.get("/", listBondsController);
router.post("/update", updateBondController);
router.get("/:id", getBondController);
router.delete("/", deleteBondsController);
router.use(commonErrors);

module.exports = router;
