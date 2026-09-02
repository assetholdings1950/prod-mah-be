const { Resend } = require("resend");
const HiringEmailLog = require("../models/hiringEmailLog.model");

const EMAIL_TYPES = Object.freeze({
    CANDIDATE_TRACKING_OTP: "candidate_tracking_otp",
    APPLICATION_RECEIVED: "application_received",
    APPLICATION_PROGRESS_UPDATED: "application_progress_updated",
    INTERVIEW_SCHEDULED: "interview_scheduled",
    INTERVIEW_RESCHEDULED: "interview_rescheduled",
    INTERVIEW_CANCELLED: "interview_cancelled",
    ASSIGNMENT_ASSIGNED: "assignment_assigned",
    ASSIGNMENT_DEADLINE_UPDATED: "assignment_deadline_updated",
    ASSIGNMENT_SUBMISSION_RECEIVED: "assignment_submission_received",
    ASSIGNMENT_REVISION_REQUESTED: "assignment_revision_requested",
    ASSESSMENT_RESULT_AVAILABLE: "assessment_result_available",
    APPLICATION_SUCCESSFUL: "application_successful",
    APPLICATION_UNSUCCESSFUL: "application_unsuccessful",
});

const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const stripHtml = (value) =>
    String(value || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

const formatDateTime = (value, timeZone = "Asia/Singapore") => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "To be confirmed";
    return new Intl.DateTimeFormat("en-SG", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone,
        timeZoneName: "short",
    }).format(date);
};

const getPortalUrl = () =>
    String(
        process.env.HIRING_PORTAL_URL ||
        process.env.CLIENT_FRONTEND_URL ||
        process.env.FRONTEND_URL ||
        "https://www.merlionassetholdings.com/hiring",
    ).replace(/\/$/, "");

const buildWorkspaceUrl = () => `${getPortalUrl()}/track`;

const getStageEmailType = (stage) => {
    if (stage === "Hired") return EMAIL_TYPES.APPLICATION_SUCCESSFUL;
    if (stage === "Rejected") return EMAIL_TYPES.APPLICATION_UNSUCCESSFUL;
    return EMAIL_TYPES.APPLICATION_PROGRESS_UPDATED;
};

const getInterviewUpdateEmailType = (before, after) => {
    if (before.status !== "Cancelled" && after.status === "Cancelled") {
        return EMAIL_TYPES.INTERVIEW_CANCELLED;
    }
    const schedulingFields = ["startAt", "endAt", "mode", "locationOrLink", "type"];
    return schedulingFields.some(
        (field) => String(before[field] ?? "") !== String(after[field] ?? ""),
    )
        ? EMAIL_TYPES.INTERVIEW_RESCHEDULED
        : null;
};

const getAssignmentUpdateEmailType = (before, after) => {
    if (before.status === "Draft" && after.status === "Published") {
        return EMAIL_TYPES.ASSIGNMENT_ASSIGNED;
    }
    if (
        after.status !== "Draft" &&
        String(before.dueAt ?? "") !== String(after.dueAt ?? "")
    ) {
        return EMAIL_TYPES.ASSIGNMENT_DEADLINE_UPDATED;
    }
    return null;
};

const makeTemplate = ({ subject, title, message, details = [], actionLabel, actionUrl }) => ({
    subject,
    title,
    message,
    details,
    actionLabel,
    actionUrl,
});

const buildHiringEmailTemplate = ({ type, application, context = {} }) => {
    const name = application.firstName || "Candidate";
    const role = application.jobSnapshot?.title || context.role || "your selected role";
    const reference = application.reference;
    const workspaceUrl = context.workspaceUrl || buildWorkspaceUrl(application, context.trackingToken);
    const commonDetails = [
        { label: "Role", value: role },
        { label: "Application reference", value: reference },
    ];

    const templates = {
        [EMAIL_TYPES.CANDIDATE_TRACKING_OTP]: makeTemplate({
            subject: "Your candidate tracking verification code",
            title: "Verify your email address",
            message: `Hello ${name}, enter the one-time password below on the Merlion candidate tracking page to view all hiring applications connected to your email address.`,
            details: [
                { label: "Applications found", value: context.applicationCount || 1 },
                { label: "One-time password", value: context.otp },
                { label: "OTP expires", value: "5 minutes after this email was requested" },
            ],
            actionLabel: "Return to candidate tracking",
            actionUrl: buildWorkspaceUrl(),
        }),
        [EMAIL_TYPES.APPLICATION_RECEIVED]: makeTemplate({
            subject: `Application received – ${role}`,
            title: "Application received",
            message: `Hello ${name}, thank you for applying to Merlion Asset Holdings. Your application has been received and will be reviewed manually by our hiring team.`,
            details: commonDetails,
            actionLabel: "View hiring page",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.APPLICATION_PROGRESS_UPDATED]: makeTemplate({
            subject: `Application progress updated – ${role}`,
            title: "Your application has progressed",
            message: `Hello ${name}, the Hiring Admin has moved your application to the ${context.stage} stage. This is a manual status update and no final decision has been made unless stated separately.`,
            details: [...commonDetails, { label: "Current stage", value: context.stage }],
            actionLabel: "View application progress",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.INTERVIEW_SCHEDULED]: makeTemplate({
            subject: `Interview scheduled – ${role}`,
            title: "Your interview has been scheduled",
            message: `Hello ${name}, the Merlion hiring team has scheduled an interview for your application.`,
            details: [
                ...commonDetails,
                { label: "Interview", value: context.interviewType },
                { label: "Date and time", value: formatDateTime(context.startAt, context.timeZone) },
                { label: "Mode", value: context.mode },
                { label: "Location or link", value: context.locationOrLink || "To be confirmed" },
                { label: "Interviewers", value: (context.interviewers || []).join(", ") || "Hiring Admin" },
            ],
            actionLabel: "View hiring page",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.INTERVIEW_RESCHEDULED]: makeTemplate({
            subject: `Interview rescheduled – ${role}`,
            title: "Your interview has been rescheduled",
            message: `Hello ${name}, your interview schedule has been updated. Please use the revised details below.`,
            details: [
                ...commonDetails,
                { label: "Interview", value: context.interviewType },
                { label: "New date and time", value: formatDateTime(context.startAt, context.timeZone) },
                { label: "Mode", value: context.mode },
                { label: "Location or link", value: context.locationOrLink || "To be confirmed" },
            ],
            actionLabel: "View hiring page",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.INTERVIEW_CANCELLED]: makeTemplate({
            subject: `Interview cancelled – ${role}`,
            title: "Interview cancellation",
            message: `Hello ${name}, your ${context.interviewType || "interview"} has been cancelled by the Hiring Admin. The hiring team will contact you separately if another interview is arranged.`,
            details: commonDetails,
            actionLabel: "View hiring page",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.ASSIGNMENT_ASSIGNED]: makeTemplate({
            subject: `Assignment assigned – ${context.assignmentTitle}`,
            title: "A hiring assignment is ready",
            message: `Hello ${name}, the Hiring Admin has assigned a ${String(context.kind || "assignment").toLowerCase()} to your application. Please review the instructions and submit it before the deadline.`,
            details: [
                ...commonDetails,
                { label: "Assignment", value: context.assignmentTitle },
                { label: "Deadline", value: formatDateTime(context.dueAt, context.timeZone) },
            ],
            actionLabel: "Open candidate workspace",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.ASSIGNMENT_DEADLINE_UPDATED]: makeTemplate({
            subject: `Assignment deadline updated – ${context.assignmentTitle}`,
            title: "Your assignment deadline has changed",
            message: `Hello ${name}, the Hiring Admin has updated the deadline for your hiring assignment.`,
            details: [
                ...commonDetails,
                { label: "Assignment", value: context.assignmentTitle },
                { label: "New deadline", value: formatDateTime(context.dueAt, context.timeZone) },
            ],
            actionLabel: "Open candidate workspace",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.ASSIGNMENT_SUBMISSION_RECEIVED]: makeTemplate({
            subject: `Assignment submission received – ${context.assignmentTitle}`,
            title: "Assignment received",
            message: `Hello ${name}, your assignment has been submitted successfully and is waiting for manual review by the Merlion hiring team.`,
            details: [
                ...commonDetails,
                { label: "Assignment", value: context.assignmentTitle },
                { label: "Submitted", value: formatDateTime(context.submittedAt, context.timeZone) },
            ],
            actionLabel: "View candidate workspace",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.ASSIGNMENT_REVISION_REQUESTED]: makeTemplate({
            subject: `Assignment revision requested – ${context.assignmentTitle}`,
            title: "Revision requested",
            message: `Hello ${name}, the Hiring Admin has requested a revision to your assignment. Review the feedback in your candidate workspace and resubmit before the deadline.`,
            details: [
                ...commonDetails,
                { label: "Assignment", value: context.assignmentTitle },
                { label: "Deadline", value: formatDateTime(context.dueAt, context.timeZone) },
            ],
            actionLabel: "Review feedback",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.ASSESSMENT_RESULT_AVAILABLE]: makeTemplate({
            subject: `Assessment result available – ${context.assignmentTitle}`,
            title: "Your assessment has been reviewed",
            message: `Hello ${name}, the Hiring Admin has completed the manual review of your assessment.`,
            details: [
                ...commonDetails,
                { label: "Assessment", value: context.assignmentTitle },
                { label: "Result", value: context.result },
            ],
            actionLabel: "View candidate workspace",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.APPLICATION_SUCCESSFUL]: makeTemplate({
            subject: `Application successful – ${role}`,
            title: "Your application was successful",
            message: `Hello ${name}, following the manual hiring process, Merlion Asset Holdings is pleased to confirm that your application has been successful. The hiring team will contact you with the next steps.`,
            details: commonDetails,
            actionLabel: "View hiring page",
            actionUrl: workspaceUrl,
        }),
        [EMAIL_TYPES.APPLICATION_UNSUCCESSFUL]: makeTemplate({
            subject: `Update on your application – ${role}`,
            title: "Your application status",
            message: `Hello ${name}, after careful manual review, we will not be progressing your application further at this time. Thank you for your interest in Merlion Asset Holdings and for the time you invested in the process.`,
            details: commonDetails,
            actionLabel: "View Merlion careers",
            actionUrl: getPortalUrl(),
        }),
    };

    if (!templates[type]) throw new Error(`Unsupported hiring email type: ${type}`);
    return templates[type];
};

const renderHiringEmail = (template) => {
    const detailRows = template.details
        .map(
            ({ label, value }) => `
                <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid #e6ebf2;color:#65728a;font-size:13px;width:38%;">${escapeHtml(label)}</td>
                    <td style="padding:10px 12px;border-bottom:1px solid #e6ebf2;color:#06163a;font-size:13px;font-weight:600;">${escapeHtml(stripHtml(value))}</td>
                </tr>`,
        )
        .join("");
    const action = template.actionUrl
        ? `<a href="${escapeHtml(template.actionUrl)}" style="display:inline-block;margin-top:24px;padding:12px 20px;border-radius:999px;background:#06163a;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(template.actionLabel || "View details")}</a>`
        : "";

    return `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,sans-serif;color:#06163a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:36px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e6ebf2;border-radius:18px;overflow:hidden;"><tr><td style="height:5px;background:#06163a"></td></tr><tr><td align="center" style="padding:34px 30px 24px;border-bottom:1px solid #eef1f5;"><img src="https://res.cloudinary.com/dctnrrrav/image/upload/f_auto,q_auto/MAH_main-logo_mjesun" width="150" alt="Merlion Asset Holdings" style="display:block;max-width:150px;height:auto;"></td></tr><tr><td style="padding:34px 34px 18px;"><h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#06163a;">${escapeHtml(template.title)}</h1><p style="margin:0;color:#52617a;font-size:15px;line-height:1.7;">${escapeHtml(template.message)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border:1px solid #e6ebf2;border-radius:12px;border-collapse:separate;overflow:hidden;">${detailRows}</table>${action}<p style="margin:20px 0 0;color:#65728a;font-size:13px;line-height:1.6;">To track your applications, open the Merlion candidate tracking page, enter the email address used in your application, and verify the six-digit OTP sent to that email.</p></td></tr><tr><td style="padding:22px 34px 30px;color:#7b879b;font-size:12px;line-height:1.6;border-top:1px solid #eef1f5;">This is a transactional recruitment email from Merlion Asset Holdings. Hiring decisions and reviews are completed manually.</td></tr></table></td></tr></table></body></html>`;
};

const sendHiringEmail = async ({ eventKey, type, application, context = {} }) => {
    let log;
    let template;
    try {
        template = buildHiringEmailTemplate({ type, application, context });
        const storedContext = { ...context };
        delete storedContext.trackingToken;
        delete storedContext.otp;
        log = await HiringEmailLog.create({
            eventKey,
            type,
            application: application._id,
            applicationReference: application.reference,
            recipient: application.email,
            subject: template.subject,
            context: storedContext,
        });
    } catch (error) {
        if (error?.code !== 11000) {
            console.error(`[hiring email] ${type} could not be prepared:`, error.message);
            return { status: false, message: error.message };
        }
        log = await HiringEmailLog.findOne({ eventKey });
        if (!log || ["pending", "sent"].includes(log.status)) {
            return { status: true, duplicate: true };
        }
        log.status = "pending";
        log.attempts += 1;
        log.lastError = "";
        await log.save();
    }

    try {
        if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
        const response = await new Resend(process.env.RESEND_API_KEY).emails.send({
            from:
                process.env.HIRING_EMAIL_FROM ||
                "Merlion Asset Holdings <noreply@send.merlionassetholdings.com>",
            replyTo: process.env.HIRING_EMAIL_REPLY_TO || undefined,
            to: [application.email],
            subject: template.subject,
            html: renderHiringEmail(template),
        });
        if (response.error) throw new Error(response.error.message || "Resend delivery failed");

        log.status = "sent";
        log.providerMessageId = response.data?.id || "";
        log.lastError = "";
        log.sentAt = new Date();
        await log.save();
        return { status: true, logId: log._id, providerMessageId: log.providerMessageId };
    } catch (error) {
        log.status = "failed";
        log.lastError = String(error.message || error).slice(0, 2000);
        await log.save().catch(() => undefined);
        console.error(`[hiring email] ${type} failed for ${application.reference}:`, error.message);
        return { status: false, message: error.message };
    }
};

module.exports = {
    EMAIL_TYPES,
    buildHiringEmailTemplate,
    renderHiringEmail,
    sendHiringEmail,
    getStageEmailType,
    getInterviewUpdateEmailType,
    getAssignmentUpdateEmailType,
    formatDateTime,
};
