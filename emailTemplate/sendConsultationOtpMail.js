const { Resend } = require("resend");

const sendConsultationOtpMail = async (to, otp) => {
    if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured.");
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
        from: "Merlion Asset Holdings <noreply@send.merlionassetholdings.com>",
        to: [to],
        subject: "Verify your consultation email",
        html: `
            <div style="background:#f4f7fb;padding:36px 16px;font-family:Arial,sans-serif;color:#081b3a">
                <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbe4ff;border-radius:18px;overflow:hidden">
                    <div style="height:4px;background:linear-gradient(90deg,#081b3a,#2563eb,#60a5fa)"></div>
                    <div style="padding:36px">
                        <h1 style="margin:0 0 14px;font-size:22px">Verify your email address</h1>
                        <p style="margin:0;color:#52627a;line-height:1.6">Enter this six-digit code to verify your email before scheduling a consultation with Merlion Asset Holdings.</p>
                        <div style="margin:28px 0;padding:18px;text-align:center;background:#f6f9ff;border:1px solid #dbe4ff;border-radius:12px;font-family:monospace;font-size:34px;font-weight:700;letter-spacing:10px">${otp}</div>
                        <p style="margin:0;color:#728096;font-size:13px;line-height:1.6">This code expires in 5 minutes. If you did not request it, you can safely ignore this email.</p>
                    </div>
                </div>
            </div>
        `,
    });

    if (error) {
        throw new Error(error.message || "Failed to send consultation OTP email.");
    }

    return data;
};

module.exports = sendConsultationOtpMail;
