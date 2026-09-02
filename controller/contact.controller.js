const sendNotificationMail = require("../emailTemplate/sendNotificationMail").default;
const {
    normalizeEmail,
    hasValidConsultEmailVerification,
    consumeConsultEmailVerification,
} = require("../services/consultEmailVerification.service");

const submitContactForm = async (req, res) => {
    try {
        const { name, email, phone, subject, message, emailVerificationToken } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                status: false,
                message: "Name, email, subject, and message are required.",
            });
        }

        const emailVerified = await hasValidConsultEmailVerification(
            normalizedEmail,
            emailVerificationToken
        );
        if (!emailVerified) {
            return res.status(403).json({
                status: false,
                message: "Please verify your email address before submitting your inquiry.",
            });
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        if (!adminEmail) {
            console.error("[CONTACT] ADMIN_EMAIL env variable is not set.");
            return res.status(500).json({ status: false, message: "Server configuration error." });
        }

        // Notify admin
        await sendNotificationMail({
            to: adminEmail,
            subject: `New Contact Inquiry: ${subject}`,
            title: "New Contact Form Submission",
            message: `You have received a new inquiry from the Merlion Asset Holdings website.`,
            details: [
                { label: "Full Name", value: name },
                { label: "Email", value: normalizedEmail },
                { label: "Phone", value: phone || "Not provided" },
                { label: "Subject", value: subject },
                { label: "Message", value: message },
                { label: "Submitted At", value: new Date().toUTCString() },
            ],
        });

        // Send confirmation to user
        await sendNotificationMail({
            to: normalizedEmail,
            subject: "We've received your inquiry — Merlion Asset Holdings",
            title: "Thank You for Reaching Out",
            message: `Dear ${name},<br/><br/>Thank you for contacting Merlion Asset Holdings. We have received your inquiry and our team will respond within 24 business hours.<br/><br/>Below is a summary of your submission:`,
            details: [
                { label: "Subject", value: subject },
                { label: "Message", value: message },
            ],
        });

        await consumeConsultEmailVerification(normalizedEmail, emailVerificationToken);

        return res.status(200).json({
            status: true,
            message: "Your inquiry has been submitted successfully.",
        });
    } catch (error) {
        console.error("[CONTACT] Error submitting contact form:", error);
        return res.status(500).json({ status: false, message: "Failed to submit inquiry. Please try again." });
    }
};

module.exports = { submitContactForm };
