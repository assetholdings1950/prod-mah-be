const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "sumangal@samdigitalsolutions.digital",
        pass: "vqxm eqpb jmlr jrjf",
    },
});

const sendAdminContactMail = async (data) => {
    const {
        name,
        email,
        phone,
        services,
        budget,
        projectDetails,
    } = data;

    // Format budget for display
    const budgetMap = {
        "<10k": "< AED 10,000",
        "10k-25k": "AED 10,000 - 25,000",
        "25k-60k": "AED 25,000 - 60,000",
        ">60k": "> AED 60,000"
    };

    const displayBudget = budgetMap[budget] || budget;

    const mailOptions = {
        from: `"Sam Digital Solutions" <sumangal@samdigitalsolutions.digital>`,
        to: "connect@samdigitalsolutions.digital",
        subject: "🚀 NEW LEAD: Contact Form Submission - Sam Digital Solutions",
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Lead - Sam Digital Solutions</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f8f9fa;
            padding: 20px;
        }
        
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .header {
            background: linear-gradient(135deg, #0c2746 0%, #1a3d6c 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .logo {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .badge {
            display: inline-block;
            background: #f47a1f;
            color: white;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin-top: 15px;
            letter-spacing: 0.5px;
        }
        
        .content {
            padding: 30px;
        }
        
        .lead-info {
            background: #f8f5f0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 25px;
            border-left: 4px solid #f47a1f;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 25px;
        }
        
        .info-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e9ecef;
        }
        
        .info-card h3 {
            color: #0c2746;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            opacity: 0.8;
        }
        
        .info-card p {
            font-size: 16px;
            font-weight: 500;
            color: #0c2746;
        }
        
        .services-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }
        
        .service-tag {
            background: #e3f2fd;
            color: #1565c0;
            padding: 6px 12px;
            border-radius: 16px;
            font-size: 13px;
            font-weight: 500;
        }
        
        .budget-badge {
            display: inline-block;
            background: #e8f5e9;
            color: #2e7d32;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 15px;
        }
        
        .project-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
        }
        
        .project-details h3 {
            color: #0c2746;
            margin-bottom: 15px;
            font-size: 16px;
        }
        
        .project-content {
            background: white;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #e9ecef;
            line-height: 1.7;
        }
        
        .footer {
            background: #f8f9fa;
            padding: 25px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #666;
            font-size: 14px;
        }
        
        .footer a {
            color: #0c2746;
            text-decoration: none;
            font-weight: 500;
        }
        
        .timestamp {
            background: #0c2746;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            margin-top: 10px;
            display: inline-block;
        }
        
        @media (max-width: 600px) {
            .content {
                padding: 20px;
            }
            
            .info-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <div class="logo">SAM DIGITAL SOLUTIONS</div>
            <p>Digital Growth Studio | Dubai</p>
            <div class="badge">🚀 NEW LEAD RECEIVED</div>
        </div>
        
        <!-- Content -->
        <div class="content">
            <!-- Lead Priority -->
            <div class="lead-info">
                <h2 style="color: #0c2746; margin-bottom: 10px;">High-Priority Lead</h2>
                <p style="color: #666;">A potential client has submitted a contact form. Please respond within 24 hours.</p>
            </div>
            
            <!-- Client Information Grid -->
            <div class="info-grid">
                <div class="info-card">
                    <h3>Client Name</h3>
                    <p>${name}</p>
                </div>
                
                <div class="info-card">
                    <h3>Email Address</h3>
                    <p><a href="mailto:${email}" style="color: #0c2746; text-decoration: none;">${email}</a></p>
                </div>
                
                <div class="info-card">
                    <h3>Phone/WhatsApp</h3>
                    <p><a href="tel:${phone}" style="color: #0c2746; text-decoration: none;">${phone}</a></p>
                </div>
            </div>
            
            <!-- Services Interested -->
            <div class="info-card">
                <h3>Services Interested In</h3>
                <div class="services-grid">
                    ${services.map(service => `
                        <div class="service-tag">${service}</div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Budget -->
            <div class="info-card">
                <h3>Project Budget</h3>
                <div class="budget-badge">${displayBudget}</div>
            </div>
            
            <!-- Project Details -->
            <div class="project-details">
                <h3>Project Details</h3>
                <div class="project-content">
                    ${projectDetails.replace(/\n/g, '<br>')}
                </div>
            </div>
            
            <!-- Quick Actions -->
            <div style="margin-top: 30px; padding: 20px; background: #fff8e1; border-radius: 8px; border-left: 4px solid #ffb300;">
                <h3 style="color: #0c2746; margin-bottom: 10px;">💡 Suggested Next Steps</h3>
                <ul style="color: #666; padding-left: 20px;">
                    <li>Send welcome email within 2 hours</li>
                    <li>Schedule discovery call within 24 hours</li>
                    <li>Prepare initial proposal based on services selected</li>
                </ul>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <p>This lead was generated from the Sam Digital Solutions website contact form.</p>
            <p><strong>Submission Time:</strong> ${new Date().toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        })}</p>
            <p style="margin-top: 15px;">
                <a href="mailto:${email}">📧 Reply to Client</a> | 
                <a href="https://wa.me/${phone.replace(/[^\d+]/g, '')}">💬 WhatsApp</a> | 
                <a href="tel:${phone}">📞 Call Now</a>
            </p>
            <div class="timestamp">
                Lead ID: SDS-${Date.now().toString().slice(-8)}
            </div>
        </div>
    </div>
</body>
</html>
        `,
    };

    return transporter.sendMail(mailOptions);
};

const sendUserWelcomeMail = async (data) => {
    const {
        fullName,
        email,
        plainPassword,
        sendPasswordMail = false
    } = data;

    const mailOptions = {
        from: `"The Cartel Admin" <sumangal@samdigitalsolutions.digital>`,
        to: email,
        subject: sendPasswordMail ? "✅ Your Password Has Been Successfully Reset | The Cartel" : "✅ Your Account Has Been Successfully Created | The Cartel",
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Welcome to The Cartel</title>
<style>
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background-color: #f4f6f8;
        padding: 20px;
        color: #333;
    }
    .container {
        max-width: 600px;
        margin: auto;
        background: #ffffff;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 6px 24px rgba(0,0,0,0.08);
    }
    .header {
        background: linear-gradient(135deg, #0c2746, #1a3d6c);
        color: #ffffff;
        padding: 30px;
        text-align: center;
    }
    .content {
        padding: 30px;
    }
    .credentials {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 20px;
        margin: 20px 0;
        border-left: 4px solid #0c2746;
    }
    .credentials p {
        margin: 8px 0;
        font-weight: 500;
    }
    .btn {
        display: inline-block;
        margin-top: 20px;
        padding: 14px 24px;
        background: #0c2746;
        color: #ffffff;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
    }
    .footer {
        background: #f4f6f8;
        padding: 20px;
        text-align: center;
        font-size: 14px;
        color: #666;
    }
</style>
</head>
<body>

<div class="container">
    <div class="header">
        <h1>Welcome to The Cartel</h1>
        <p>Your account is ready 🎉</p>
    </div>

    <div class="content">
        <p>Hi <strong>${fullName}</strong>,</p>
        ${sendPasswordMail ? `<p>Your password has been reset successfully` : `<p>Your account has been successfully added to <strong>The Cartel Admin System</strong>.</p>`}
        

        <div class="credentials">
            <p><strong>Login URL:</strong><br/>
            <a href="http://admin.thecartel.ai/" target="_blank">
                http://admin.thecartel.ai/
            </a></p>

            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> ${plainPassword}</p>
        </div>

        <p>Please log in using the above credentials. For security reasons, we strongly recommend changing your password immediately after logging in.</p>

        <a href="http://admin.thecartel.ai/" class="btn">Login to Dashboard</a>
    </div>

    <div class="footer">
        <p>If you did not expect this email, please contact the system administrator immediately.</p>
        <p>© ${new Date().getFullYear()} The Cartel Ai</p>
    </div>
</div>

</body>
</html>
        `,
    };

    return transporter.sendMail(mailOptions);
};

module.exports = {
    sendAdminContactMail,
    sendUserWelcomeMail
};