const { Resend } = require("resend");
require("dotenv").config();


const resend = new Resend(process.env.RESEND_API_KEY);

async function sendWelcomeEmail() {
  try {
    const data = await resend.emails.send({
      from: "Merlion Asset Holdings <noreply@send.merlionassetholdings.com>",
      to: ["sumangaldey8972@gmail.com"],
      subject: "Welcome to Merlion Asset Holdings",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Welcome</title>
        </head>
        <body style="font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; padding:40px;">
                  <tr>
                    <td align="center">
                      <h1 style="color:#1f2937;">Merlion Asset Holdings</h1>
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <h2 style="color:#111827;">Welcome!</h2>

                      <p style="color:#4b5563; font-size:16px; line-height:1.6;">
                        Your account has been successfully created and is now active.
                      </p>

                      <p style="color:#4b5563; font-size:16px; line-height:1.6;">
                        Thank you for choosing Merlion Asset Holdings. You can now
                        access your account and begin using our services.
                      </p>

                      <p style="color:#4b5563; font-size:16px; line-height:1.6;">
                        If you did not create this account, please contact our support
                        team immediately.
                      </p>

                      <br>

                      <p>
                        Regards,<br>
                        <strong>Merlion Asset Holdings</strong>
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding-top:30px; border-top:1px solid #e5e7eb;">
                      <p style="font-size:12px; color:#6b7280;">
                        This is an automated message. Please do not reply to this email.
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

    console.log("Email sent successfully:");
  } catch (error) {
    console.error("Email sending failed:");
    console.error(error);
  }
}

sendWelcomeEmail();