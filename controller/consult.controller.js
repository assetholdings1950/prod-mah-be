const {
    requestConsultEmailOtp,
    verifyConsultEmailOtp,
} = require("../services/consultEmailVerification.service");

const sendConsultEmailOtp = async (req, res) => {
    try {
        const result = await requestConsultEmailOtp(req.body?.email);
        return res.status(result.statusCode).json({
            status: result.status,
            message: result.message,
            ...(result.retryAfterSeconds
                ? { retryAfterSeconds: result.retryAfterSeconds }
                : {}),
        });
    } catch (error) {
        console.error("[CONSULT OTP] Failed to send OTP:", error.message);
        const invalidRecipient = /invalid `to` field|email address needs to follow/i.test(
            String(error.message || "")
        );
        return res.status(invalidRecipient ? 400 : 500).json({
            status: false,
            message: invalidRecipient
                ? "Please enter a valid email address, such as name@example.com."
                : "We could not send the verification code. Please try again shortly.",
        });
    }
};

const verifyConsultEmailOtpCode = async (req, res) => {
    try {
        const result = await verifyConsultEmailOtp(req.body?.email, req.body?.otp);
        return res.status(result.statusCode).json({
            status: result.status,
            message: result.message,
            ...(result.verificationToken ? { verificationToken: result.verificationToken } : {}),
        });
    } catch (error) {
        console.error("[CONSULT OTP] Failed to verify OTP:", error.message);
        return res.status(500).json({
            status: false,
            message: "Failed to verify the code. Please try again.",
        });
    }
};

module.exports = {
    sendConsultEmailOtp,
    verifyConsultEmailOtpCode,
};
