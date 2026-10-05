const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    listClientBondsController,
    getClientBondController,
    downloadClientBondDocumentController,
    investInBondController,
    getMyBondInvestmentsController,
    getMyBondInvestmentController,
} = require("../controller/clientBond.controller");

const router = express.Router();

router.use(authenticate, requireRole(["client"]));
router.get("/", listClientBondsController);
router.get("/investments/my", getMyBondInvestmentsController);
router.get("/investments/:investmentId", getMyBondInvestmentController);
router.get("/:id/documents/:documentType", downloadClientBondDocumentController);
router.post("/:id/invest", investInBondController);
router.get("/:identifier", getClientBondController);
router.use(commonErrors);

module.exports = router;
