const express = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const { commonErrors } = require("../errors/error");
const controller = require("../controller/accountOpeningForm.controller");

const router = express.Router();
router.post("/", authenticate, controller.submitAccountOpeningFormController);
router.get("/me", authenticate, controller.getMyAccountOpeningFormController);
router.get("/me/pdf", authenticate, controller.downloadMyAccountOpeningFormController);
router.get("/client/:clientId", authenticate, requireRole(["admin", "superadmin"]), controller.getClientAccountOpeningFormController);
router.patch("/:id/status", authenticate, requireRole(["admin", "superadmin"]), controller.updateAccountOpeningStatusController);
router.delete("/:id", authenticate, requireRole(["admin", "superadmin"]), controller.deleteAccountOpeningFormController);
router.use(commonErrors);

module.exports = router;
