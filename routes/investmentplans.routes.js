const express = require("express");
const { commonErrors } = require("../errors/error");
const {
    createInvestmentPlanController,
    investmentPlanListController,
    getInvestmentPlanByIdController,
    editInvestmentPlanController,
    deleteInvestmentPlanController
} = require("../controller/investmentplans.controller");

const router = express.Router();

router.post("/", createInvestmentPlanController);

router.get("/", investmentPlanListController);

router.get("/:id", getInvestmentPlanByIdController);

router.post("/update", editInvestmentPlanController);

router.delete("/", deleteInvestmentPlanController);

router.use(commonErrors);

module.exports = router;