const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "smtp.zoho.in",
    port: 587,
    secure: false,
    auth: {
        user: process.env.ZOHO_USER,
        pass: process.env.ZOHO_PASS,
    },
});

/**
 * Generic mail sender
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.html
 */
const sendMail = async ({ to, subject, html }) => {
    try {
        const mailOptions = {
            from: `"The Cartel Ai" <${process.env.ZOHO_USER}>`,
            to,
            subject,
            html,
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Mail sent to ${to}`);
    } catch (error) {
        console.error("❌ Error sending mail:", error.message);
    }
};

module.exports = { sendMail };
