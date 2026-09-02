import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function sendOtpMail(to, otp, subject) {
    try {
        const data = await resend.emails.send({
            from: "Merlion Asset Holdings <noreply@send.merlionassetholdings.com>",
            to: [to],
            subject: subject,
            html: `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Secure Verification</title>
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

    <table width="100%" maxWidth="580" cellpadding="0" cellspacing="0" border="0" style="
        max-width: 580px;
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
                    Mandatory Identity Verification
                </h2>

                <p style="
                    color: #4A5568;
                    font-size: 15px;
                    line-height: 1.65;
                    margin: 0 0 30px 0;
                ">
                    To maintain the perimeter security of your institutional portfolio access, please use the secure One-Time Password (OTP) below to authorize your session registration.
                </p>

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 35px 0;">
                    <tr>
                        <td align="center">
                            <div style="
                                background-color: #F8FAFC;
                                border: 1px solid #E2E8F0;
                                border-radius: 14px;
                                padding: 22px 40px;
                                display: inline-block;
                                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.01);
                            ">
                                <span style="
                                    font-family: 'Courier New', Courier, monospace;
                                    font-size: 38px;
                                    font-weight: 700;
                                    letter-spacing: 10px;
                                    color: #06163A;
                                    margin-right: -10px; /* Offset trailing space from letter-spacing */
                                ">${otp}</span>
                            </div>
                        </td>
                    </tr>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="
                    background-color: #F8FAFC;
                    border-radius: 12px;
                    margin-bottom: 30px;
                ">
                    <tr>
                        <td style="padding: 16px 20px;">
                            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #718096;">
                                • This high-security token will expire in <strong style="color: #06163A;">5 minutes</strong>.<br />
                                • Merlion Asset Holdings personnel will never request this passcode via telephone or secondary channels.
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
                    If you did not initiate this system access, please securely disregard this statement or contact your dedicated Relationship Manager immediately.
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

        console.log("Email sent successfully.");
    } catch (error) {
        console.error("Email sending failed:");
        console.error(error);
    }
}

export async function sendGenericMail(to, subject, html) {
    try {
        const data = await resend.emails.send({
            from: "Merlion Asset Holdings <noreply@send.merlionassetholdings.com>",
            to: [to],
            subject: subject,
            html: html,
        });
        console.log("Generic email sent successfully.");
    } catch (error) {
        console.error("Generic email sending failed:");
        console.error(error);
    }
}

// 1 Raffles Place, Tower 1, Singapore 048616