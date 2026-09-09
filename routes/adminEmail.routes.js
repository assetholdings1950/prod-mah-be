const express = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    sendEmailController,
    replyEmailController,
    listEmailThreadsController,
    getEmailThreadController,
    updateEmailThreadController,
    getEmailAttachmentController,
    resendWebhookController,
} = require("../controller/adminEmail.controller");

const router = express.Router();

// Resend must reach this endpoint without an admin token. Requests are verified
// with the raw body and RESEND_WEBHOOK_SECRET in the controller.
router.post("/webhooks/resend", resendWebhookController);

router.use(authenticate, requireRole(["Admin", "Super-Admin"]));
router.route("/").get(listEmailThreadsController).post(sendEmailController);
router
    .route("/threads/:id")
    .get(getEmailThreadController)
    .patch(updateEmailThreadController);
router.post("/threads/:id/reply", replyEmailController);
router.get("/messages/:messageId/attachments/:attachmentId", getEmailAttachmentController);

module.exports = router;
