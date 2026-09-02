import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function sendWelcomeMail(to, subject) {
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
<title>Account Activated</title>
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
                    Welcome to Onboarding
                </h2>

                <p style="
                    color: #4A5568;
                    font-size: 15px;
                    line-height: 1.65;
                    margin: 0 0 35px 0;
                ">
                    Thank you for choosing **Merlion Asset Holdings**. Your digital access credential registration is officially complete. To initiate institutional asset placement and unlock active management features, global regulatory compliance mandates that we establish certified identity verification.
                </p>

                <h3 style="
                    margin: 0 0 15px 0;
                    color: #06163A;
                    font-size: 14px;
                    font-weight: 700;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                ">
                    Mandatory KYC Verification Roadmap
                </h3>
                
                <p style="
                    color: #718096;
                    font-size: 14px;
                    margin: 0 0 20px 0;
                    line-height: 1.5;
                ">
                    Please prepare the following components ahead of your onboarding call or dashboard portal submission:
                </p>

                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 35px;">
                    <tr>
                        <td style="padding-bottom: 16px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <h4 style="margin: 0 0 6px 0; color: #06163A; font-size: 15px; font-weight: 600;">
                                            1. Government Issued Identification
                                        </h4>
                                        <p style="margin: 0; color: #4A5568; font-size: 13.5px; line-height: 1.5;">
                                            You must supply a valid primary document (NRIC, Passport, or Employment Pass) alongside its explicit **Identification Number**. High-resolution, uncropped **front and back images** are strictly required.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <tr>
                        <td>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <h4 style="margin: 0 0 6px 0; color: #06163A; font-size: 15px; font-weight: 600;">
                                            2. Live Biometrics & Self-Declaration
                                        </h4>
                                        <p style="margin: 0; color: #4A5568; font-size: 13.5px; line-height: 1.5;">
                                            To complete anti-spoofing dynamic checkpoints, you will need to complete a **live selfie capture** as well as record a brief, automated **self-declaration video** statement inside our secure interface.
                                        </p>
                                    </td>
                                </tr>
                            </table>
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
                    Should you require concierge assistance or institutional guidance regarding asset thresholds, please reach out directly to your assigned Relationship Manager.
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

// 1 Raffles Place, Tower 1, Singapore 048616