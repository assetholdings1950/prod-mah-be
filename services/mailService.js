const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport(
    (process.env.ZOHO_USER && process.env.ZOHO_PASS)
        ? {
            host: "smtp.zoho.in",
            port: 587,
            secure: false,
            auth: {
                user: process.env.ZOHO_USER,
                pass: process.env.ZOHO_PASS
            }
        }
        : {
            service: "gmail",
            auth: {
                user: "sumangal@samdigitalsolutions.digital",
                pass: "vqxm eqpb jmlr jrjf",
            }
        }
);
/**
 * Send admin notification when new member is created
 * @param {Object} member - Newly created member object
 */
const sendNewMemberMail = async (member) => {
    console.log({ member }, process.env.ZOHO_USER, process.env.ZOHO_PASS)
    const fromEmail = process.env.ZOHO_USER || "sumangal@samdigitalsolutions.digital";
    try {
        const mailOptions = {
            from: `"The Cartel Ai Community" <${fromEmail}>`,
            to: process.env.ADMIN_EMAIL_OG, // admin’s email
            subject: `New Member Registered: ${member.email}`,
            html: `
        <h2>New Member Registered 🎉</h2>
        <p><b>Email:</b> ${member.email}</p>
        <p><b>Telegram:</b> ${member.telegramUsername}</p>
        <p><b>Experience:</b> ${member.tradingExperience}</p>
        <p><b>Plan:</b> ${member.plan?.name || "N/A"} ($${member.plan?.price || ""})</p>
        <p><b>Registered At:</b> ${new Date(member.createdAt).toLocaleString()}</p>
        
        <br/>
        <p>Thanks & Regards,</p>
        <p><b>The Cartel Ai Community</b></p>
      `
        };

        await transporter.sendMail(mailOptions);
        console.log("✅ Admin notified about new member");
    } catch (error) {
        console.error("❌ Error sending mail:", error.message);
    }
};




module.exports = { sendNewMemberMail };
