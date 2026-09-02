import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sent when an Agent registers a client on their behalf.
 * Delivers the login credentials (email + temporary password) to the client.
 * The client then logs in with these credentials and receives an OTP to verify
 * their email (handled at first login, see authQuery in client.query.js).
 */
export default async function sendCredentialsMail(to, { firstName, email, password, loginUrl, agentName } = {}) {
    try {
        const portalUrl = loginUrl || process.env.CLIENT_PORTAL_URL || "https://merlionassetholdings.com/login";

        await resend.emails.send({
            from: "Merlion Asset Holdings <noreply@send.merlionassetholdings.com>",
            to: [to],
            subject: "Your Merlion Asset Holdings Account Credentials",
            html: `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Account Credentials</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
</style>
</head>

<body style="
    margin: 0;
    padding: 0;
    background-color: #F4F6F9;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F4F6F9; table-layout: fixed;">
<tr>
<td align="center" style="padding: 50px 20px;">

    <table width="100%" maxWidth="600" cellpadding="0" cellspacing="0" border="0" style="
        max-width: 600px;
        background-color: #ffffff;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 12px 30px rgba(6, 22, 58, 0.04), 0 2px 4px rgba(6, 22, 58, 0.02);
        border: 1px solid #EAEFF5;
    ">

        <tr>
            <td height="5" style="background: linear-gradient(90deg, #06163A 0%, #C5A880 50%, #06163A 100%); line-height: 5px; font-size: 1px;">&nbsp;</td>
        </tr>

        <tr>
            <td align="center" style="padding: 45px 40px 35px 40px; border-bottom: 1px solid #F0F4F8;">
                <img
                    src="https://res.cloudinary.com/dctnrrrav/image/upload/f_auto,q_auto/MAH_main-logo_mjesun"
                    alt="Merlion Asset Holdings"
                    width="140"
                    style="display: block; margin: 0 auto 24px auto;"
                />
                <h1 style="
                    margin: 0;
                    color: #06163A;
                    font-size: 20px;
                    font-weight: 700;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                ">
                    Merlion Asset Holdings
                </h1>
                <p style="
                    margin: 6px 0 0 0;
                    color: #C5A880;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 3px;
                    text-transform: uppercase;
                ">
                    Private Wealth & Asset Management
                </p>
            </td>
        </tr>

        <tr>
            <td style="padding: 45px 45px 30px 45px;">

                <h2 style="
                    margin: 0 0 18px 0;
                    color: #06163A;
                    font-size: 22px;
                    font-weight: 600;
                    letter-spacing: -0.5px;
                ">
                    ${firstName ? `Welcome, ${firstName}` : "Welcome to Your Portal"}
                </h2>

                <p style="
                    color: #4A5568;
                    font-size: 15px;
                    line-height: 1.65;
                    margin: 0 0 30px 0;
                ">
                    ${agentName ? `${agentName} of` : "An advisor at"} Merlion Asset Holdings has created a secure investor account for you. Use the credentials below to log in to your portal. For your security, you will be asked to verify your email with a one-time passcode the first time you sign in.
                </p>

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="
                    background-color: #F8FAFC;
                    border: 1px solid #E2E8F0;
                    border-radius: 14px;
                    margin: 0 0 30px 0;
                ">
                    <tr>
                        <td style="padding: 22px 24px;">
                            <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #94A3B8;">
                                Email Address
                            </p>
                            <p style="margin: 0 0 18px 0; font-size: 16px; font-weight: 700; color: #06163A; word-break: break-all;">
                                ${email}
                            </p>
                            <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #94A3B8;">
                                Temporary Password
                            </p>
                            <p style="margin: 0; font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: 700; color: #06163A; letter-spacing: 1px; word-break: break-all;">
                                ${password}
                            </p>
                        </td>
                    </tr>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 30px 0;">
                    <tr>
                        <td align="center">
                            <a href="${portalUrl}" style="
                                display: inline-block;
                                background-color: #06163A;
                                color: #FFFFFF;
                                text-decoration: none;
                                font-size: 14px;
                                font-weight: 600;
                                padding: 14px 40px;
                                border-radius: 10px;
                                letter-spacing: 0.5px;
                            ">
                                Log In to Your Portal
                            </a>
                        </td>
                    </tr>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="
                    background-color: #FFFBEB;
                    border: 1px solid #FDE68A;
                    border-radius: 12px;
                ">
                    <tr>
                        <td style="padding: 16px 20px;">
                            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #92400E;">
                                • Keep these credentials confidential. We recommend changing your password after your first login.<br />
                                • Merlion Asset Holdings personnel will never ask for your password.
                            </p>
                        </td>
                    </tr>
                </table>

                <p style="
                    color: #718096;
                    font-size: 13px;
                    line-height: 1.6;
                    margin: 30px 0 0 0;
                    border-top: 1px solid #E2E8F0;
                    padding-top: 25px;
                ">
                    If you were not expecting this account, please disregard this email or contact your Relationship Manager.
                </p>

            </td>
        </tr>

        <tr>
            <td style="
                background-color: #06163A;
                text-align: center;
                padding: 35px 40px;
            ">
                <p style="
                    margin: 0;
                    color: #FFFFFF;
                    font-size: 12px;
                    font-weight: 500;
                    letter-spacing: 1px;
                ">
                    &copy; ${new Date().getFullYear()} Merlion Asset Holdings Private Limited.
                </p>
                <p style="
                    margin: 8px 0 0 0;
                    color: #A0AEC0;
                    font-size: 11px;
                    line-height: 1.5;
                ">
                    Regulated by the Monetary Authority of Singapore (MAS).<br />
                </p>
            </td>
        </tr>

    </table>

</td>
</tr>
</table>

</body>
</html>
`,
        });

        console.log("Credentials email sent successfully.");
    } catch (error) {
        console.error("Credentials email sending failed:");
        console.error(error);
    }
}
