const otpTemplate = (otp) => {
  return `
    <div style="font-family: 'Geist Sans', Arial, sans-serif; background-color: #eef2ff; padding: 40px 20px; min-height: 100%;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(6, 21, 58, 0.05); border: 1px solid #dbe4ff;">
        
        <!-- Top Multi-color Brand Border Accent -->
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
          <tr>
            <td style="background-color: #0b2e84; height: 4px; width: 60%;"></td>
            <td style="background-color: #f3122f; height: 4px; width: 25%;"></td>
            <td style="background-color: #f4b400; height: 4px; width: 15%;"></td>
          </tr>
        </table>

        <div style="padding: 35px 30px;">
          
          <!-- Header / Brand Identifier -->
          <div style="text-align: center; margin-bottom: 25px;">
            <div style="font-size: 20px; font-weight: 800; color: #06153a; letter-spacing: -0.02em; margin: 0;">
              GiftNow<span style="color: #0b2e84;">Mart</span>
            </div>
            <div style="font-size: 10px; font-weight: 700; uppercase; tracking: 0.1em; color: #f3122f; margin-top: 4px; letter-spacing: 1px;">
              ADMIN SECURITY CONSOLE
            </div>
          </div>

          <hr style="border: 0; border-top: 1px solid #eef2ff; margin-bottom: 25px;" />

          <!-- Context Title -->
          <h2 style="font-size: 18px; font-weight: 700; color: #06153a; margin-top: 0; margin-bottom: 8px; text-align: center;">
            Two-Factor Authentication
          </h2>
          <p style="font-size: 13px; color: #555555; line-height: 1.5; margin: 0; text-align: center;">
            A request was made to access your admin management account. Use the verification code below to authorize this session.
          </p>

          <!-- Premium Display OTP Container Box -->
          <div style="margin: 30px 0; background-color: #eef2ff; border: 1px solid #dbe4ff; border-radius: 12px; padding: 20px; text-align: center;">
            <div style="font-family: 'Geist Mono', monospace, Arial; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0b2e84; padding: 5px 0 5px 8px;">
              ${otp}
            </div>
            <div style="display: inline-block; margin-top: 10px; background-color: rgba(243, 18, 47, 0.08); border: 1px solid rgba(243, 18, 47, 0.15); border-radius: 6px; padding: 4px 10px;">
              <p style="color: #f3122f; font-size: 11px; font-weight: 700; margin: 0;">
                ⏱ Expires in 1 minute
              </p>
            </div>
          </div>

          <!-- Quick Security Notice -->
          <table width="100%" cellspacing="0" cellpadding="0" style="background-color: #fafafa; border-radius: 8px; padding: 12px; border-left: 3px solid #f4b400;">
            <tr>
              <td style="font-size: 12px; color: #666666; line-height: 1.5;">
                <strong>Security Alert:</strong> If you did not initiate this validation request, another party may have your credentials. Please update your master password immediately.
              </td>
            </tr>
          </table>

        </div>

        <!-- Footer Module Section -->
        <div style="background-color: #fafafa; border-top: 1px solid #eef2ff; padding: 20px 30px; text-align: center;">
          <p style="color: #888888; font-size: 11px; line-height: 1.4; margin: 0;">
            This is an automated operational system update. Please do not reply directly to this mailbox.
          </p>
          <p style="color: #06153a; font-size: 11px; font-weight: 700; margin-top: 8px; margin-bottom: 0;">
            © ${new Date().getFullYear()} GiftNowMart Admin Engine. All Rights Reserved.
          </p>
        </div>

      </div>
    </div>
  `;
};


const passwordChangedTemplate = () => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Password Changed</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                background-color: #f4f4f7;
                margin: 0;
                padding: 0;
            }
            .container {
                max-width: 500px;
                margin: 40px auto;
                background: #ffffff;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.08);
            }
            h2 {
                color: #333333;
                margin-bottom: 10px;
            }
            p {
                color: #555555;
                line-height: 1.6;
            }
            .footer {
                text-align: center;
                margin-top: 25px;
                font-size: 12px;
                color: #888888;
            }
            .btn {
                display: inline-block;
                background-color: #4f46e5;
                color: #ffffff !important;
                padding: 10px 18px;
                border-radius: 6px;
                margin-top: 20px;
                text-decoration: none;
                font-weight: bold;
            }
            .warning-box {
                background: #fff8e6;
                border-left: 4px solid #f5a623;
                padding: 12px 15px;
                margin-top: 20px;
                border-radius: 6px;
            }
        </style>
    </head>
    <body>

    <div class="container">
        <h2>Password Changed Successfully</h2>

        <p>Hello,</p>

        <p>This is to notify you that your <strong>account password has been changed</strong> successfully.</p>

        <div class="warning-box">
            <p>If you did not perform this action, please reset your password immediately and secure your account.</p>
        </div>

        
        <p class="footer">If you need help, please contact our support team.</p>
        </div>
        
        </body>
        </html>
        `;
};

// <a href="#" class="btn">Secure My Account</a>


const publisherRequestTemplate = (data) => {
  const {
    accountType,
    fullName,
    organizationName,
    phoneNumber,
    countryCode,
    telegramUsername,
    website,
    description,
    profileLink,
    userEmail,
    createdAt
  } = data;

  const dashboardUrl = `${process.env.ADMIN_DASHBOARD_URL}/publishers`;

  return `
    <div style="font-family: Arial, sans-serif; background-color: #0d0d0d; color: #e6e6e6; padding: 20px; border-radius: 10px;">
      
      <h2 style="color: #d4af37;">📢 New Publisher Request</h2>
      <p>A new publisher application has been submitted on <b>The Cartel Ai</b>.</p>

      <h3 style="color: #ff3b3b;">Applicant Details:</h3>
      <ul>
        <li><b>Account Type:</b> ${accountType}</li>
        <li><b>Name:</b> ${accountType === "individual" ? fullName : organizationName}</li>
        <li><b>Email:</b> ${userEmail}</li>
        <li><b>Phone:</b> ${countryCode} ${phoneNumber}</li>
        <li><b>Telegram:</b> ${telegramUsername || "N/A"}</li>
      </ul>

      <h3 style="color: #ff3b3b;">Publisher Information:</h3>
      <ul>
        <li><b>Website:</b> ${website || "N/A"}</li>
        <li><b>Profile Link:</b> ${profileLink || "N/A"}</li>
        <li><b>Description:</b> ${description || "N/A"}</li>
        <li><b>Submitted At:</b> ${new Date(createdAt).toLocaleString()}</li>
      </ul>

      <p>
        👉 <a href="${dashboardUrl}" style="color: #d4af37; text-decoration: none; font-weight: bold;">Open Publisher Dashboard</a>
      </p>

      <br/>
      <p>Kind regards,</p>
      <p><b>The Cartel Ai Admin System</b></p>
    </div>
  `;
};


const publisherConfirmationTemplate = (data) => {
  const { fullName, organizationName, accountType } = data;

  const displayName = accountType === "individual" ? fullName : organizationName;

  return `
    <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; border-radius: 10px; color: #333;">
      <h2 style="color: #2b6cb0;">🎉 Your Publisher Request Has Been Submitted!</h2>

      <p>Hi <b>${displayName}</b>,</p>

      <p>
        Thank you for submitting your publisher application on 
        <b>The Cartel Ai</b>.
      </p>

      <p>
        Our team will review your request and notify you shortly.  
        This typically takes <b>24–48 hours</b>.
      </p>

      <p>If we need more details, we will contact you via email.</p>

      <br/>
      <p>Regards,</p>
      <p><b>The Cartel Ai Team</b></p>
    </div>
  `;
};


const publisherRejectedEmailTemplate = ({
  userName,
  website,
  reason,
  company
}) => {
  const year = new Date().getFullYear();

  return `
     <div style="font-family: Arial, sans-serif; background:#0d0d0d; color:#f5f5f5; padding:20px; border-radius:8px;">
        <h2 style="color:#ff4b4b;">Website Verification Rejected</h2>

        <p>Hi <b>${userName}</b>,</p>

        <p>
            We reviewed your website submission for the publisher program:
        </p>

        <p style="background:#1a1a1a; padding:10px; border-left:4px solid #ff4b4b;">
            <b>Website:</b> ${website} <br />
            <b>Reason:</b> ${reason}
        </p>

        <p>
            Unfortunately, your website does not meet our current publisher guidelines.
            You can update your information and submit the publisher form again anytime.
        </p>

        <p>Regards,<br /><b>The Cartel Ai Team</b></p>
    </div>
    `;
};

const publisherVerifiedEmailTemplate = ({
  userName,
  website,
  company
}) => {
  const year = new Date().getFullYear();

  return `
    <div style="font-family: Arial, sans-serif; background:#ffffff; color:#333; padding:20px; border-radius:8px; border:1px solid #e6e6e6;">
        <h2 style="color:#28a745;">Website Verification Successful</h2>

        <p>Hi <b>${userName}</b>,</p>

        <p>
            Great news! Your website has been successfully verified for our publisher program.
        </p>

        <p style="background:#f7f7f7; padding:10px; border-left:4px solid #28a745;">
            <b>Website:</b> ${website} <br />
            <b>Status:</b> Verified ✔
        </p>

        <p>
            You are now eligible to access all publisher features, submit campaigns, 
            and collaborate with <b>The Cartel Ai</b>.
        </p>

        <p>
           We're excited to have you onboard and look forward to working with you!
        </p>

        <p>Regards,<br /><b>The Cartel Ai Team</b></p>
    </div>
  `;
};


module.exports = {
  otpTemplate,
  passwordChangedTemplate,
  publisherRequestTemplate,
  publisherConfirmationTemplate,
  publisherRejectedEmailTemplate,
  publisherVerifiedEmailTemplate
}