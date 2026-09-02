const express = require("express");
const {
    sendConsultEmailOtp,
    verifyConsultEmailOtpCode,
} = require("../controller/consult.controller");

const router = express.Router();

router.post("/send-otp", sendConsultEmailOtp);
router.post("/verify-otp", verifyConsultEmailOtpCode);

module.exports = router;
