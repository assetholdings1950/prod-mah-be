const express = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const { commonErrors } = require("../errors/error");
const controller = require("../controller/fundTrustReport.controller");

const router = express.Router();
const reportAdmins = ["Admin", "Super-Admin"];

router.get("/public", controller.listPublishedFundTrustReportsController);

router.use(authenticate, requireRole(reportAdmins));
router.route("/")
    .get(controller.listFundTrustReportsController)
    .post(controller.createFundTrustReportController)
    .delete(controller.deleteFundTrustReportsController);
router.route("/:id")
    .get(controller.getFundTrustReportController)
    .put(controller.updateFundTrustReportController)
    .patch(controller.updateFundTrustReportController);

router.use(commonErrors);
module.exports = router;
