const express = require("express");
const { getPlanChargesController, upsertPlanChargesController } = require("../controller/planCharges.controller");

const router = express.Router();

router.get("/:planId", getPlanChargesController);
router.post("/",       upsertPlanChargesController);

module.exports = router;
