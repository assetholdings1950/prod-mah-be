const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Job = require("../models/job.model");
const HiringCounter = require("../models/hiringCounter.model");
const HiringApplication = require("../models/hiringApplication.model");
const AssignmentTemplate = require("../models/assignmentTemplate.model");
const CandidateAssignment = require("../models/candidateAssignment.model");
const HiringInterview = require("../models/hiringInterview.model");
const HiringInterviewAvailability = require("../models/hiringInterviewAvailability.model");
const CandidateEvaluation = require("../models/candidateEvaluation.model");
const HiringEmailLog = require("../models/hiringEmailLog.model");
const OtpVerification = require("../models/otpVerification.model");
const {
    EMAIL_TYPES,
    sendHiringEmail,
    getStageEmailType,
    getInterviewUpdateEmailType,
    getAssignmentUpdateEmailType,
} = require("../services/hiringEmail.service");

const CANDIDATE_STAGES = [
    "Applied",
    "Initial review",
    "Screening",
    "Assessment",
    "Role interview",
    "Standards interview",
    "Decision",
    "Hired",
];

const hashToken = (token) =>
    crypto.createHash("sha256").update(String(token || "")).digest("hex");

const getCandidateAccessSecret = () =>
    process.env.HIRING_ACCESS_SECRET || process.env.JWT_SECRET;

const createCandidateEmailAccess = (email) =>
    jwt.sign(
        { scope: "hiring-candidate", email: String(email).trim().toLowerCase() },
        getCandidateAccessSecret(),
        { expiresIn: "8h" },
    );

const verifyCandidateEmailAccess = (token) => {
    try {
        const payload = jwt.verify(String(token || ""), getCandidateAccessSecret());
        return payload.scope === "hiring-candidate" ? payload.email : null;
    } catch {
        return null;
    }
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractObjectId = (value) => {
    const normalized = String(value || "");
    if (mongoose.isValidObjectId(normalized)) return normalized;
    const match = normalized.match(/([a-f\d]{24})$/i);
    return match?.[1] || null;
};

const formatError = (error) => {
    if (error?.name === "ValidationError") {
        return Object.values(error.errors)
            .map((item) => item.message)
            .join(", ");
    }
    return error.message;
};

const normalizeAsset = (asset, assetType) => {
    if (!asset) return null;
    return {
        assetType,
        secureUrl: asset.secureUrl || asset.url || asset.secure_url,
        publicId: asset.publicId || asset.public_id || "",
        resourceType: asset.resourceType || asset.resource_type || "raw",
        format: asset.format || "",
        bytes: Number(asset.bytes || asset.optimizedBytes || 0),
        originalFilename: asset.originalFilename || asset.filename || "file",
        originalBytes: Number(asset.originalBytes || asset.bytes || 0),
        optimizedBytes: Number(asset.optimizedBytes || asset.bytes || 0),
        compressionApplied: Boolean(asset.compressionApplied),
    };
};

const nextApplicationReference = async () => {
    const year = new Date().getUTCFullYear();
    const counter = await HiringCounter.findOneAndUpdate(
        { key: `application-${year}` },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return `MAH-HR-${year}-${String(counter.value).padStart(4, "0")}`;
};

const appendActivity = async (
    application,
    { action, detail = "", actorId = null, actorLabel = "System", visibility = "internal" },
) => {
    application.activities.push({
        action,
        detail,
        actorId,
        actorLabel,
        visibility,
        at: new Date(),
    });
};

const findApplication = async (identifier, includeToken = false) => {
    const query = mongoose.isValidObjectId(identifier)
        ? { _id: identifier }
        : { reference: String(identifier || "").toUpperCase() };
    const finder = HiringApplication.findOne(query);
    if (includeToken) finder.select("+trackingTokenHash");
    return finder;
};

const verifyCandidateAccess = async (reference, token, emailAccessToken) => {
    const application = await findApplication(reference, true);
    if (!application) return null;
    const accessEmail = verifyCandidateEmailAccess(emailAccessToken);
    if (accessEmail && application.email === accessEmail) return application;
    if (!token) return null;
    const suppliedHash = hashToken(token);
    const storedHash = application.trackingTokenHash;
    if (!storedHash || storedHash.length !== suppliedHash.length) return null;
    const matches = crypto.timingSafeEqual(
        Buffer.from(storedHash, "hex"),
        Buffer.from(suppliedHash, "hex"),
    );
    return matches ? application : null;
};

const requestCandidateAccessQuery = async (email) => {
    try {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return { status: false, statusCode: 400, message: "A valid email address is required" };
        }
        const application = await HiringApplication.findOne({
            email: normalizedEmail,
            archivedAt: null,
        }).sort({ submittedAt: -1 });
        if (application) {
            const otpLookupEmail = `hiring:${normalizedEmail}`;
            const recentlySent = await HiringEmailLog.exists({
                type: EMAIL_TYPES.CANDIDATE_TRACKING_OTP,
                recipient: normalizedEmail,
                createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
            });
            if (recentlySent) return { status: true, statusCode: 200 };
            const applicationCount = await HiringApplication.countDocuments({
                email: normalizedEmail,
                archivedAt: null,
            });
            const otp = String(Math.floor(100000 + Math.random() * 900000));
            await OtpVerification.findOneAndUpdate(
                { email: otpLookupEmail },
                {
                    email: otpLookupEmail,
                    otpCode: otp,
                    otpExpires: new Date(Date.now() + 5 * 60 * 1000),
                    createdAt: new Date(),
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );
            await sendHiringEmail({
                eventKey: `candidate_otp:${application._id}:${crypto.randomUUID()}`,
                type: EMAIL_TYPES.CANDIDATE_TRACKING_OTP,
                application,
                context: {
                    otp,
                    applicationCount,
                },
            });
        }
        return { status: true, statusCode: 200 };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const verifyCandidateOtpQuery = async (email, otp) => {
    try {
        const normalizedEmail = String(email || "").trim().toLowerCase();
        const normalizedOtp = String(otp || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !/^\d{6}$/.test(normalizedOtp)) {
            return { status: false, statusCode: 400, message: "Enter a valid email and six-digit OTP" };
        }
        // Namespace hiring OTP records so they cannot collide with account,
        // client, or agent OTPs stored in the shared OTP collection.
        const otpEntry = await OtpVerification.findOne({
            email: `hiring:${normalizedEmail}`,
        });
        if (!otpEntry || otpEntry.otpCode !== normalizedOtp) {
            return { status: false, statusCode: 400, message: "Invalid OTP" };
        }
        if (otpEntry.otpExpires < new Date()) {
            await OtpVerification.deleteOne({ _id: otpEntry._id });
            return { status: false, statusCode: 400, message: "OTP expired. Request a new OTP." };
        }
        const applicationExists = await HiringApplication.exists({
            email: normalizedEmail,
            archivedAt: null,
        });
        if (!applicationExists) {
            return { status: false, statusCode: 401, message: "Candidate access could not be verified" };
        }
        await OtpVerification.deleteOne({ _id: otpEntry._id });
        return {
            status: true,
            statusCode: 200,
            accessToken: createCandidateEmailAccess(normalizedEmail),
        };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const createHiringApplicationQuery = async (payload) => {
    try {
        const jobId = extractObjectId(payload.jobId);
        if (!jobId) {
            return { status: false, statusCode: 400, message: "A valid job ID is required" };
        }
        const job = await Job.findOne({ _id: jobId, status: "Active" });
        if (!job) {
            return { status: false, statusCode: 404, message: "This job is not accepting applications" };
        }

        const email = String(payload.email || "").trim().toLowerCase();
        const duplicate = await HiringApplication.findOne({
            job: job._id,
            email,
            stage: { $ne: "Rejected" },
            archivedAt: null,
        }).lean();
        if (duplicate) {
            return {
                status: false,
                statusCode: 409,
                message: "An active application already exists for this email and job",
            };
        }

        const trackingToken = crypto.randomBytes(32).toString("hex");
        const reference = await nextApplicationReference();
        const application = new HiringApplication({
            reference,
            trackingTokenHash: hashToken(trackingToken),
            job: job._id,
            jobSnapshot: { title: job.title, location: job.location, type: job.type },
            firstName: payload.firstName,
            lastName: payload.lastName,
            email,
            phoneNumber: payload.phoneNumber,
            countryCode: payload.countryCode,
            country: payload.country,
            city: payload.city,
            highestQualification: payload.highestQualification,
            yearsOfExperience: payload.yearsOfExperience,
            currentRole: payload.currentRole,
            currentCompany: payload.currentCompany,
            professionalSummary: payload.professionalSummary,
            motivation: payload.motivation || payload.whyMerlion,
            strengths: payload.strengths || [],
            consent: payload.consent,
            resume: normalizeAsset(payload.resume, "resume"),
            introductionVideo: normalizeAsset(payload.introductionVideo, "introduction_video"),
        });
        await appendActivity(application, {
            action: "Application submitted",
            detail: "Candidate completed the public application form.",
            actorLabel: `${payload.firstName || ""} ${payload.lastName || ""}`.trim() || "Candidate",
            visibility: "candidate",
        });
        await application.save();
        await sendHiringEmail({
            eventKey: `application_received:${application._id}`,
            type: EMAIL_TYPES.APPLICATION_RECEIVED,
            application,
            context: { trackingToken },
        });

        return {
            status: true,
            statusCode: 201,
            application,
            trackingToken,
        };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const listHiringApplicationsQuery = async ({
    page = 1,
    limit = 20,
    stage,
    jobId,
    search,
    sort = "newest",
} = {}) => {
    try {
        const normalizedPage = Math.max(Number(page) || 1, 1);
        const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
        const filter = { archivedAt: null };
        if (stage) filter.stage = stage;
        if (jobId && mongoose.isValidObjectId(jobId)) filter.job = jobId;
        if (search) {
            const regex = new RegExp(escapeRegex(search), "i");
            filter.$or = [
                { reference: regex },
                { firstName: regex },
                { lastName: regex },
                { email: regex },
                { "jobSnapshot.title": regex },
            ];
        }
        const sortOrder = sort === "oldest" ? 1 : -1;
        const [applications, totalDocs] = await Promise.all([
            HiringApplication.find(filter)
                .sort({ submittedAt: sortOrder })
                .skip((normalizedPage - 1) * normalizedLimit)
                .limit(normalizedLimit)
                .select("-notes -review -activities")
                .lean(),
            HiringApplication.countDocuments(filter),
        ]);
        return {
            status: true,
            statusCode: 200,
            applications,
            pagination: {
                page: normalizedPage,
                limit: normalizedLimit,
                totalDocs,
                totalPages: Math.ceil(totalDocs / normalizedLimit),
            },
        };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const listHiringCandidateOptionsQuery = async ({ search, limit = 100 } = {}) => {
    try {
        const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
        const filter = { archivedAt: null, stage: { $ne: "Rejected" } };
        if (search) {
            const regex = new RegExp(escapeRegex(search), "i");
            filter.$or = [
                { reference: regex },
                { firstName: regex },
                { lastName: regex },
                { email: regex },
            ];
        }
        const candidates = await HiringApplication.find(filter)
            .select("reference firstName lastName email jobSnapshot.title stage submittedAt")
            .sort({ submittedAt: -1 })
            .limit(normalizedLimit)
            .lean();
        return { status: true, statusCode: 200, candidates };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const getHiringApplicationQuery = async (identifier) => {
    try {
        const application = await findApplication(identifier);
        if (!application) {
            return { status: false, statusCode: 404, message: "Application not found" };
        }
        const [assignments, interviews, evaluation] = await Promise.all([
            CandidateAssignment.find({ application: application._id }).sort({ createdAt: -1 }).lean(),
            HiringInterview.find({ application: application._id }).sort({ startAt: 1 }).lean(),
            CandidateEvaluation.findOne({ application: application._id }).lean(),
        ]);
        return { status: true, statusCode: 200, application, assignments, interviews, evaluation };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const getHiringApplicationResumeQuery = async (identifier) => {
    try {
        const application = await findApplication(identifier);
        if (!application?.resume?.secureUrl || !application.resume.publicId) {
            return { status: false, statusCode: 404, message: "Resume not found" };
        }
        if (!/^https:\/\/res\.cloudinary\.com\//i.test(application.resume.secureUrl)) {
            return { status: false, statusCode: 400, message: "Resume URL is not trusted" };
        }
        return { status: true, statusCode: 200, application };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const updateApplicationStageQuery = async (identifier, stage, adminId) => {
    try {
        const application = await findApplication(identifier);
        if (!application) {
            return { status: false, statusCode: 404, message: "Application not found" };
        }
        if (![...CANDIDATE_STAGES, "Rejected"].includes(stage)) {
            return { status: false, statusCode: 400, message: "Invalid hiring stage" };
        }
        const previousStage = application.stage;
        if (previousStage === stage) {
            return { status: true, statusCode: 200, application, unchanged: true };
        }
        application.stage = stage;
        application.stageUpdatedAt = new Date();
        if (stage === "Hired") application.hiredAt = new Date();
        if (stage === "Rejected") application.rejectedAt = new Date();
        await appendActivity(application, {
            action: stage === "Rejected" ? "Application rejected" : "Hiring stage updated",
            detail: `${previousStage} → ${stage}`,
            actorId: adminId,
            actorLabel: "Hiring Admin",
            visibility: "candidate",
        });
        await application.save();
        await sendHiringEmail({
            eventKey: `application_stage:${application._id}:${stage}:${application.stageUpdatedAt.getTime()}`,
            type: getStageEmailType(stage),
            application,
            context: { stage },
        });
        return { status: true, statusCode: 200, application };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const saveApplicationReviewQuery = async (identifier, payload, adminId) => {
    try {
        const application = await findApplication(identifier);
        if (!application) {
            return { status: false, statusCode: 404, message: "Application not found" };
        }
        const allowed = [
            "eligibilityConfirmed",
            "experienceRelevant",
            "documentsReviewed",
            "introductionVideoReviewed",
            "conflictCheck",
            "notesAdded",
            "nextReviewDueAt",
        ];
        allowed.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(payload, field)) {
                application.review[field] = payload[field];
            }
        });
        application.review.reviewedBy = adminId || null;
        application.review.reviewedAt = new Date();
        await appendActivity(application, {
            action: "Manual review saved",
            detail: "The Hiring Admin updated the review checklist.",
            actorId: adminId,
            actorLabel: "Hiring Admin",
        });
        await application.save();
        return { status: true, statusCode: 200, review: application.review };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const addApplicationNoteQuery = async (identifier, body, adminId) => {
    try {
        const application = await findApplication(identifier);
        if (!application) {
            return { status: false, statusCode: 404, message: "Application not found" };
        }
        const normalizedBody = String(body || "").trim();
        if (!normalizedBody) {
            return { status: false, statusCode: 400, message: "Note body is required" };
        }
        application.notes.push({ body: normalizedBody, createdBy: adminId || null });
        application.review.notesAdded = true;
        await appendActivity(application, {
            action: "Private note added",
            detail: "An internal hiring note was saved.",
            actorId: adminId,
            actorLabel: "Hiring Admin",
        });
        await application.save();
        return { status: true, statusCode: 201, note: application.notes.at(-1) };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const sanitizeQuestionsForCandidate = (questions = []) =>
    questions.map((question) => {
        const candidateQuestion = { ...question };
        delete candidateQuestion.referenceAnswer;
        return candidateQuestion;
    });

const validateCandidateAnswers = (questions = [], answers = []) => {
    const questionById = new Map(
        questions.map((question) => [String(question._id || question.id), question]),
    );
    const answeredIds = new Set();

    for (const answer of answers) {
        const questionId = String(answer.questionId || "");
        const question = questionById.get(questionId);
        if (!question) return "An answer references a question that is not in this assignment";
        if (answeredIds.has(questionId)) return "Each assignment question can only be answered once";

        const hasText = String(answer.textAnswer || "").trim().length > 0;
        const hasSelection = String(answer.selectedOption || "").trim().length > 0;
        const attachments = Array.isArray(answer.attachments) ? answer.attachments : [];
        const hasAttachments = attachments.length > 0;

        if (question.type === "mcq" && hasSelection && !(question.options || []).includes(answer.selectedOption)) {
            return "A selected multiple-choice answer is invalid";
        }
        if (question.type === "practical" && hasAttachments) {
            const formats = new Set((question.acceptedFormats || []).map((format) => format.toUpperCase()));
            const invalidAttachment = attachments.some((attachment) => {
                const format = String(attachment.format || attachment.originalFilename?.split(".").pop() || "").toUpperCase();
                return !formats.has(format) || Number(attachment.bytes || 0) > 25 * 1024 * 1024;
            });
            if (invalidAttachment) return "A practical submission attachment has an invalid format or exceeds 25MB";
        }

        if (hasText || hasSelection || hasAttachments) answeredIds.add(questionId);
    }

    if (questions.some((question) => question.required && !answeredIds.has(String(question._id || question.id)))) {
        return "Every required question must be answered";
    }
    return null;
};

const sanitizeAssignmentForCandidate = (assignment) => {
    const value = assignment.toObject ? assignment.toObject() : { ...assignment };
    const snapshot = { ...(value.templateSnapshot || {}) };
    snapshot.questions = sanitizeQuestionsForCandidate(snapshot.questions || []);
    delete snapshot.createdBy;
    delete snapshot.updatedBy;
    return {
        _id: value._id,
        applicationReference: value.applicationReference,
        title: value.title,
        kind: value.kind,
        status: value.status,
        dueAt: value.dueAt,
        publishedAt: value.publishedAt,
        startedAt: value.startedAt,
        submittedAt: value.submittedAt,
        candidateInstructions: value.candidateInstructions,
        answers: value.answers,
        submissionNotes: value.submissionNotes,
        score: value.score,
        maximumScore: value.maximumScore,
        feedback: value.feedback,
        resubmissionCount: value.resubmissionCount,
        maxResubmissions: value.maxResubmissions,
        template: snapshot,
    };
};

const sanitizeInterviewForCandidate = (interview) => ({
    _id: interview._id,
    type: interview.type,
    startAt: interview.startAt,
    endAt: interview.endAt,
    mode: interview.mode,
    locationOrLink: interview.locationOrLink,
    interviewers: interview.interviewers,
    status: interview.status,
});

const buildCandidateWorkspace = async (application) => {
    const [assignments, interviews] = await Promise.all([
        CandidateAssignment.find({ application: application._id, status: { $ne: "Draft" } }).sort({ dueAt: 1 }),
        HiringInterview.find({ application: application._id, status: { $in: ["Scheduled", "Completed"] } }).sort({ startAt: 1 }).lean(),
    ]);
    return {
        reference: application.reference,
        candidateName: `${application.firstName} ${application.lastName}`,
        role: application.jobSnapshot.title,
        stage: application.stage,
        submittedAt: application.submittedAt,
        progress: CANDIDATE_STAGES,
        activities: application.activities.filter((activity) => activity.visibility === "candidate"),
        assignments: assignments.map(sanitizeAssignmentForCandidate),
        interviews: interviews.map(sanitizeInterviewForCandidate),
    };
};

const getCandidateWorkspaceQuery = async (reference, token, emailAccessToken) => {
    try {
        const accessEmail = verifyCandidateEmailAccess(emailAccessToken);
        if (accessEmail) {
            const applications = await HiringApplication.find({
                email: accessEmail,
                archivedAt: null,
            }).sort({ submittedAt: -1 });
            return {
                status: true,
                statusCode: 200,
                workspace: {
                    email: accessEmail,
                    applications: await Promise.all(applications.map(buildCandidateWorkspace)),
                },
            };
        }
        const application = await verifyCandidateAccess(reference, token);
        if (!application) {
            return { status: false, statusCode: 401, message: "Invalid application access" };
        }
        return {
            status: true,
            statusCode: 200,
            workspace: await buildCandidateWorkspace(application),
        };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const createCandidateAssignmentQuery = async (payload, adminId) => {
    try {
        const application = await findApplication(
            payload.applicationId || payload.applicationReference || payload.candidateId,
        );
        if (!application) {
            return { status: false, statusCode: 404, message: "Application not found" };
        }
        if (!mongoose.isValidObjectId(payload.templateId)) {
            return { status: false, statusCode: 400, message: "A valid assignment template is required" };
        }
        const template = await AssignmentTemplate.findById(payload.templateId).lean();
        if (!template) {
            return { status: false, statusCode: 404, message: "Assignment template not found" };
        }
        if (template.status !== "Published") {
            return { status: false, statusCode: 409, message: "Publish the assignment template before assigning it" };
        }
        const dueAt = new Date(payload.dueAt);
        if (Number.isNaN(dueAt.getTime())) {
            return { status: false, statusCode: 400, message: "A valid assignment deadline is required" };
        }
        const publish = payload.status === "Published" || payload.publish === true;
        const assignment = await CandidateAssignment.create({
            application: application._id,
            applicationReference: application.reference,
            candidateName: `${application.firstName} ${application.lastName}`,
            role: application.jobSnapshot.title,
            template: template._id,
            templateSnapshot: template,
            title: template.title,
            kind: payload.kind || "Assignment",
            status: publish ? "Published" : "Draft",
            dueAt,
            publishedAt: publish ? new Date() : null,
            candidateInstructions: payload.candidateInstructions || template.instructions,
            maximumScore: template.totalMarks,
            maxResubmissions:
                template.resubmissionPolicy === "No resubmission allowed" ? 0 : 1,
            createdBy: adminId || null,
            updatedBy: adminId || null,
        });
        await appendActivity(application, {
            action: publish ? "Assignment published" : "Assignment prepared",
            detail: `${template.title} was ${publish ? "assigned" : "saved as a draft"}.`,
            actorId: adminId,
            actorLabel: "Hiring Admin",
            visibility: publish ? "candidate" : "internal",
        });
        await application.save();
        if (publish) {
            await sendHiringEmail({
                eventKey: `assignment_assigned:${assignment._id}:${assignment.publishedAt.getTime()}`,
                type: EMAIL_TYPES.ASSIGNMENT_ASSIGNED,
                application,
                context: {
                    assignmentTitle: assignment.title,
                    kind: assignment.kind,
                    dueAt: assignment.dueAt,
                },
            });
        }
        return { status: true, statusCode: 201, assignment };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const listCandidateAssignmentsQuery = async ({ page = 1, limit = 20, status, applicationId } = {}) => {
    try {
        const normalizedPage = Math.max(Number(page) || 1, 1);
        const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
        const filter = {};
        if (status) filter.status = status;
        if (applicationId) {
            const application = await findApplication(applicationId);
            if (!application) {
                return { status: false, statusCode: 404, message: "Application not found" };
            }
            filter.application = application._id;
        }
        const [assignments, totalDocs] = await Promise.all([
            CandidateAssignment.find(filter)
                .sort({ createdAt: -1 })
                .skip((normalizedPage - 1) * normalizedLimit)
                .limit(normalizedLimit)
                .lean(),
            CandidateAssignment.countDocuments(filter),
        ]);
        return {
            status: true,
            statusCode: 200,
            assignments,
            pagination: {
                page: normalizedPage,
                limit: normalizedLimit,
                totalDocs,
                totalPages: Math.ceil(totalDocs / normalizedLimit),
            },
        };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const updateCandidateAssignmentQuery = async (id, payload, adminId) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid assignment ID" };
        }
        const assignment = await CandidateAssignment.findById(id);
        if (!assignment) {
            return { status: false, statusCode: 404, message: "Candidate assignment not found" };
        }
        const before = {
            status: assignment.status,
            dueAt: assignment.dueAt,
        };
        ["dueAt", "candidateInstructions", "maxResubmissions"].forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(payload, field)) assignment[field] = payload[field];
        });
        if (payload.status === "Published" && assignment.status === "Draft") {
            assignment.status = "Published";
            assignment.publishedAt = new Date();
        }
        assignment.updatedBy = adminId || assignment.updatedBy;
        await assignment.save();
        const emailType = getAssignmentUpdateEmailType(before, assignment);
        if (emailType) {
            const application = await HiringApplication.findById(assignment.application);
            if (application) {
                await sendHiringEmail({
                    eventKey: `${emailType}:${assignment._id}:${assignment.updatedAt.getTime()}`,
                    type: emailType,
                    application,
                    context: {
                        assignmentTitle: assignment.title,
                        kind: assignment.kind,
                        dueAt: assignment.dueAt,
                    },
                });
            }
        }
        return { status: true, statusCode: 200, assignment };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const deleteCandidateAssignmentQuery = async (id) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid assignment ID" };
        }
        const assignment = await CandidateAssignment.findByIdAndDelete(id);
        if (!assignment) {
            return { status: false, statusCode: 404, message: "Candidate assignment not found" };
        }
        return { status: true, statusCode: 200, deletedCount: 1 };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const bulkDeleteCandidateAssignmentsQuery = async (ids) => {
    try {
        const assignmentIds = [...new Set(Array.isArray(ids) ? ids.map(String) : [])];
        if (assignmentIds.length === 0 || assignmentIds.length > 100) {
            return {
                status: false,
                statusCode: 400,
                message: "Select between 1 and 100 candidate assignments",
            };
        }
        if (assignmentIds.some((id) => !mongoose.isValidObjectId(id))) {
            return { status: false, statusCode: 400, message: "An assignment ID is invalid" };
        }
        const result = await CandidateAssignment.deleteMany({ _id: { $in: assignmentIds } });
        return { status: true, statusCode: 200, deletedCount: result.deletedCount };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const resetCandidateAssignmentQuery = async (id, payload, adminId) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid assignment ID" };
        }
        const assignment = await CandidateAssignment.findById(id);
        if (!assignment) {
            return { status: false, statusCode: 404, message: "Candidate assignment not found" };
        }
        if (
            ![
                "Submitted",
                "Under review",
                "Passed",
                "Revision requested",
                "Not passed",
            ].includes(assignment.status)
        ) {
            return {
                status: false,
                statusCode: 409,
                message: "Only a submitted or reviewed assignment can be reset",
            };
        }

        assignment.status = "Published";
        assignment.startedAt = null;
        assignment.submittedAt = null;
        assignment.answers = [];
        assignment.submissionNotes = "";
        assignment.score = null;
        assignment.feedback = "";
        assignment.questionReviews = [];
        assignment.reviewer = null;
        assignment.reviewHistory = [];
        assignment.resubmissionCount = 0;
        if (payload?.dueAt) assignment.dueAt = payload.dueAt;
        assignment.updatedBy = adminId || assignment.updatedBy;
        await assignment.save();

        return { status: true, statusCode: 200, assignment };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const startCandidateAssignmentQuery = async (id, reference, token, emailAccessToken) => {
    try {
        const application = await verifyCandidateAccess(reference, token, emailAccessToken);
        if (!application) {
            return { status: false, statusCode: 401, message: "Invalid application access" };
        }
        const assignment = await CandidateAssignment.findOne({ _id: id, application: application._id });
        if (!assignment) {
            return { status: false, statusCode: 404, message: "Assignment not found" };
        }
        if (assignment.dueAt < new Date()) {
            return { status: false, statusCode: 409, message: "The assignment deadline has passed" };
        }
        if (assignment.status !== "Published" && assignment.status !== "In progress") {
            return { status: false, statusCode: 409, message: "This assignment cannot be started in its current state" };
        }
        if (assignment.status === "Published") {
            assignment.status = "In progress";
            assignment.startedAt = new Date();
            await assignment.save();
        }
        return { status: true, statusCode: 200, assignment: sanitizeAssignmentForCandidate(assignment) };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const submitCandidateAssignmentQuery = async (id, payload) => {
    try {
        const application = await verifyCandidateAccess(payload.reference, payload.token, payload.access);
        if (!application) {
            return { status: false, statusCode: 401, message: "Invalid application access" };
        }
        const assignment = await CandidateAssignment.findOne({ _id: id, application: application._id });
        if (!assignment) {
            return { status: false, statusCode: 404, message: "Assignment not found" };
        }
        if (!["Published", "In progress", "Revision requested"].includes(assignment.status)) {
            return { status: false, statusCode: 409, message: "This assignment cannot be submitted in its current state" };
        }
        if (assignment.dueAt < new Date()) {
            return { status: false, statusCode: 409, message: "The assignment deadline has passed" };
        }
        const questions = assignment.templateSnapshot.questions || [];
        const answers = Array.isArray(payload.answers) ? payload.answers : [];
        const answerError = validateCandidateAnswers(questions, answers);
        if (answerError) return { status: false, statusCode: 400, message: answerError };
        if (assignment.status === "Revision requested") {
            if (assignment.resubmissionCount >= assignment.maxResubmissions) {
                return { status: false, statusCode: 409, message: "No resubmissions remain" };
            }
            assignment.resubmissionCount += 1;
        }
        assignment.answers = answers;
        assignment.submissionNotes = payload.submissionNotes || "";
        assignment.status = "Submitted";
        assignment.submittedAt = new Date();
        await assignment.save();
        await appendActivity(application, {
            action: "Assignment submitted",
            detail: assignment.title,
            actorLabel: `${application.firstName} ${application.lastName}`,
            visibility: "candidate",
        });
        await application.save();
        await sendHiringEmail({
            eventKey: `assignment_submitted:${assignment._id}:${assignment.submittedAt.getTime()}`,
            type: EMAIL_TYPES.ASSIGNMENT_SUBMISSION_RECEIVED,
            application,
            context: {
                assignmentTitle: assignment.title,
                submittedAt: assignment.submittedAt,
            },
        });
        return { status: true, statusCode: 200, assignment: sanitizeAssignmentForCandidate(assignment) };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const reviewCandidateAssignmentQuery = async (id, payload, adminId) => {
    try {
        const assignment = await CandidateAssignment.findById(id);
        if (!assignment) {
            return { status: false, statusCode: 404, message: "Candidate assignment not found" };
        }
        const previousStatus = assignment.status;
        if (!["Submitted", "Under review"].includes(previousStatus)) {
            return {
                status: false,
                statusCode: 409,
                message: "Only submitted assignments can be reviewed",
            };
        }
        const allowedStatuses = ["Under review", "Passed", "Revision requested", "Not passed"];
        if (!allowedStatuses.includes(payload.status)) {
            return { status: false, statusCode: 400, message: "Invalid assessment review status" };
        }
        const questions = assignment.templateSnapshot?.questions || [];
        const answerByQuestion = new Map(
            (assignment.answers || []).map((answer) => [String(answer.questionId), answer]),
        );
        const existingReviewByQuestion = new Map(
            (assignment.questionReviews || []).map((review) => [String(review.questionId), review]),
        );
        const submittedReviewByQuestion = new Map();
        for (const review of Array.isArray(payload.questionReviews) ? payload.questionReviews : []) {
            const questionId = String(review.questionId || "");
            if (!questionId || submittedReviewByQuestion.has(questionId)) {
                return {
                    status: false,
                    statusCode: 400,
                    message: "Each question can only be reviewed once",
                };
            }
            submittedReviewByQuestion.set(questionId, review);
        }

        const questionReviews = [];
        const unmarkedQuestions = [];
        for (const question of questions) {
            const questionId = String(question._id || question.id);
            const maximumMarks = Number(question.marks || 0);
            const answer = answerByQuestion.get(questionId);

            if (question.type === "mcq") {
                const awardedMarks =
                    answer?.selectedOption && answer.selectedOption === question.referenceAnswer
                        ? maximumMarks
                        : 0;
                questionReviews.push({
                    questionId,
                    awardedMarks,
                    maximumMarks,
                    autoScored: true,
                    feedback:
                        awardedMarks === maximumMarks
                            ? "Correct answer"
                            : "Incorrect answer",
                });
                continue;
            }

            const submittedReview = submittedReviewByQuestion.get(questionId);
            const existingReview = existingReviewByQuestion.get(questionId);
            const rawMarks = submittedReview?.awardedMarks ?? existingReview?.awardedMarks;
            if (rawMarks === undefined || rawMarks === null || rawMarks === "") {
                unmarkedQuestions.push(question.title || questionId);
                continue;
            }

            const awardedMarks = Number(rawMarks);
            if (
                !Number.isFinite(awardedMarks) ||
                awardedMarks < 0 ||
                awardedMarks > maximumMarks
            ) {
                return {
                    status: false,
                    statusCode: 400,
                    message: `Marks for ${question.title || "a question"} must be between 0 and ${maximumMarks}`,
                };
            }
            questionReviews.push({
                questionId,
                awardedMarks,
                maximumMarks,
                autoScored: false,
                feedback: submittedReview?.feedback ?? existingReview?.feedback ?? "",
            });
        }

        if (["Passed", "Not passed"].includes(payload.status) && unmarkedQuestions.length) {
            return {
                status: false,
                statusCode: 400,
                message: "Every written, case-study, and practical question must be marked before a final result",
            };
        }

        assignment.questionReviews = questionReviews;
        assignment.score = questionReviews.reduce(
            (total, review) => total + Number(review.awardedMarks || 0),
            0,
        );
        assignment.status = payload.status;
        assignment.feedback = payload.feedback || "";
        assignment.reviewer = adminId || null;
        assignment.updatedBy = adminId || null;
        assignment.reviewHistory.push({
            status: payload.status,
            score: assignment.score,
            feedback: assignment.feedback,
            reviewer: adminId || null,
            questionReviews,
        });
        await assignment.save();
        const application = await HiringApplication.findById(assignment.application);
        if (application) {
            await appendActivity(application, {
                action: "Assignment review updated",
                detail: `${assignment.title}: ${payload.status}`,
                actorId: adminId,
                actorLabel: "Hiring Admin",
                visibility: "candidate",
            });
            await application.save();
            const emailType =
                previousStatus !== payload.status && payload.status === "Revision requested"
                    ? EMAIL_TYPES.ASSIGNMENT_REVISION_REQUESTED
                    : previousStatus !== payload.status && ["Passed", "Not passed"].includes(payload.status)
                        ? EMAIL_TYPES.ASSESSMENT_RESULT_AVAILABLE
                        : null;
            if (emailType) {
                await sendHiringEmail({
                    eventKey: `${emailType}:${assignment._id}:${assignment.updatedAt.getTime()}`,
                    type: emailType,
                    application,
                    context: {
                        assignmentTitle: assignment.title,
                        dueAt: assignment.dueAt,
                        result: payload.status,
                    },
                });
            }
        }
        return { status: true, statusCode: 200, assignment };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const createInterviewQuery = async (payload, adminId) => {
    try {
        const application = await findApplication(
            payload.applicationId || payload.applicationReference || payload.candidateId,
        );
        if (!application) {
            return { status: false, statusCode: 404, message: "Application not found" };
        }
        const startAt = new Date(payload.startAt);
        const endAt = new Date(payload.endAt);
        if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
            return { status: false, statusCode: 400, message: "Choose a valid interview time range" };
        }
        const [conflictingInterview, availabilityRules] = await Promise.all([
            HiringInterview.exists({
                status: { $nin: ["Cancelled"] },
                startAt: { $lt: endAt },
                endAt: { $gt: startAt },
            }),
            HiringInterviewAvailability.find({
                startAt: { $lt: endAt },
                endAt: { $gt: startAt },
            }).select("startAt endAt status").lean(),
        ]);
        if (conflictingInterview) {
            return { status: false, statusCode: 409, message: "This time overlaps another scheduled interview" };
        }
        if (availabilityRules.some((slot) => slot.status === "Unavailable")) {
            return { status: false, statusCode: 409, message: "This time is marked unavailable" };
        }
        const hasAvailabilityRules = availabilityRules.length > 0;
        const isCoveredByAvailableSlot = availabilityRules.some(
            (slot) => slot.status === "Available" && slot.startAt <= startAt && slot.endAt >= endAt,
        );
        if (hasAvailabilityRules && !isCoveredByAvailableSlot) {
            return { status: false, statusCode: 409, message: "Choose a time inside an available slot" };
        }
        const interview = await HiringInterview.create({
            application: application._id,
            applicationReference: application.reference,
            candidateName: `${application.firstName} ${application.lastName}`,
            role: application.jobSnapshot.title,
            startAt,
            endAt,
            type: payload.type,
            mode: payload.mode,
            locationOrLink: payload.locationOrLink,
            interviewers: payload.interviewers?.length ? payload.interviewers : ["Hiring Admin"],
            preparation: payload.preparation,
            notes: payload.notes,
            createdBy: adminId || null,
            updatedBy: adminId || null,
        });
        await appendActivity(application, {
            action: "Interview scheduled",
            detail: `${interview.type} on ${new Date(interview.startAt).toISOString()}`,
            actorId: adminId,
            actorLabel: "Hiring Admin",
            visibility: "candidate",
        });
        await application.save();
        await sendHiringEmail({
            eventKey: `interview_scheduled:${interview._id}`,
            type: EMAIL_TYPES.INTERVIEW_SCHEDULED,
            application,
            context: {
                interviewType: interview.type,
                startAt: interview.startAt,
                mode: interview.mode,
                locationOrLink: interview.locationOrLink,
                interviewers: interview.interviewers,
            },
        });
        return { status: true, statusCode: 201, interview };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const listInterviewsQuery = async ({ from, to, status, applicationId } = {}) => {
    try {
        const filter = {};
        if (status) filter.status = status;
        if (from || to) {
            filter.startAt = {};
            if (from) filter.startAt.$gte = new Date(from);
            if (to) filter.startAt.$lte = new Date(to);
        }
        if (applicationId) {
            const application = await findApplication(applicationId);
            if (!application) return { status: false, statusCode: 404, message: "Application not found" };
            filter.application = application._id;
        }
        const interviews = await HiringInterview.find(filter)
            .select("application applicationReference candidateName role startAt endAt type mode locationOrLink interviewers status notes outcome recommendation")
            .sort({ startAt: 1 })
            .lean();
        return { status: true, statusCode: 200, interviews };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const normalizeCalendarRange = (from, to) => {
    const start = new Date(from);
    const end = new Date(to);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
    if (end.getTime() - start.getTime() > 31 * 24 * 60 * 60 * 1000) return null;
    return { start, end };
};

const getInterviewCalendarQuery = async ({ from, to, timezone = "Asia/Singapore" } = {}) => {
    try {
        const range = normalizeCalendarRange(from, to);
        if (!range) {
            return { status: false, statusCode: 400, message: "A valid calendar range of up to 31 days is required" };
        }
        const overlap = { startAt: { $lt: range.end }, endAt: { $gt: range.start } };
        const [interviews, availability] = await Promise.all([
            HiringInterview.find({ ...overlap, status: { $ne: "Cancelled" } })
                .select("applicationReference candidateName role startAt endAt type mode locationOrLink interviewers status")
                .sort({ startAt: 1 })
                .lean(),
            HiringInterviewAvailability.find(overlap)
                .select("startAt endAt status label timezone")
                .sort({ startAt: 1 })
                .lean(),
        ]);
        return {
            status: true,
            statusCode: 200,
            calendar: {
                from: range.start,
                to: range.end,
                timezone,
                interviews,
                availability,
                summary: {
                    booked: interviews.length,
                    available: availability.filter((slot) => slot.status === "Available").length,
                    unavailable: availability.filter((slot) => slot.status === "Unavailable").length,
                },
            },
        };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const createInterviewAvailabilityQuery = async (payload, adminId) => {
    try {
        const startAt = new Date(payload.startAt);
        const endAt = new Date(payload.endAt);
        if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
            return { status: false, statusCode: 400, message: "Choose a valid availability time range" };
        }
        const overlapping = await HiringInterviewAvailability.exists({
            startAt: { $lt: endAt },
            endAt: { $gt: startAt },
        });
        if (overlapping) {
            return { status: false, statusCode: 409, message: "This availability overlaps an existing availability rule" };
        }
        const availability = await HiringInterviewAvailability.create({
            startAt,
            endAt,
            status: payload.status,
            label: payload.label || "",
            timezone: payload.timezone || "Asia/Singapore",
            createdBy: adminId || null,
            updatedBy: adminId || null,
        });
        return { status: true, statusCode: 201, availability };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const deleteInterviewAvailabilityQuery = async (id) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid availability ID" };
        }
        const availability = await HiringInterviewAvailability.findByIdAndDelete(id);
        if (!availability) return { status: false, statusCode: 404, message: "Availability rule not found" };
        return { status: true, statusCode: 200 };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const updateInterviewQuery = async (id, payload, adminId) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid interview ID" };
        }
        const interview = await HiringInterview.findById(id);
        if (!interview) return { status: false, statusCode: 404, message: "Interview not found" };
        const before = {
            startAt: interview.startAt,
            endAt: interview.endAt,
            type: interview.type,
            mode: interview.mode,
            locationOrLink: interview.locationOrLink,
            status: interview.status,
        };
        const fields = [
            "startAt",
            "endAt",
            "type",
            "mode",
            "locationOrLink",
            "interviewers",
            "status",
            "preparation",
            "notes",
            "outcome",
            "recommendation",
        ];
        fields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(payload, field)) interview[field] = payload[field];
        });
        if (payload.startAt || payload.endAt) {
            const [conflict, unavailable] = await Promise.all([
                HiringInterview.exists({
                    _id: { $ne: interview._id },
                    status: { $ne: "Cancelled" },
                    startAt: { $lt: interview.endAt },
                    endAt: { $gt: interview.startAt },
                }),
                HiringInterviewAvailability.exists({
                    status: "Unavailable",
                    startAt: { $lt: interview.endAt },
                    endAt: { $gt: interview.startAt },
                }),
            ]);
            if (conflict) {
                return { status: false, statusCode: 409, message: "This time overlaps another scheduled interview" };
            }
            if (unavailable) {
                return { status: false, statusCode: 409, message: "This time is marked unavailable" };
            }
        }
        interview.updatedBy = adminId || interview.updatedBy;
        await interview.save();
        const emailType = getInterviewUpdateEmailType(before, interview);
        if (emailType) {
            const application = await HiringApplication.findById(interview.application);
            if (application) {
                await sendHiringEmail({
                    eventKey: `${emailType}:${interview._id}:${interview.updatedAt.getTime()}`,
                    type: emailType,
                    application,
                    context: {
                        interviewType: interview.type,
                        startAt: interview.startAt,
                        mode: interview.mode,
                        locationOrLink: interview.locationOrLink,
                        interviewers: interview.interviewers,
                    },
                });
            }
        }
        return { status: true, statusCode: 200, interview };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const deleteInterviewQuery = async (id) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid interview ID" };
        }
        const interview = await HiringInterview.findByIdAndDelete(id);
        if (!interview) return { status: false, statusCode: 404, message: "Interview not found" };
        const application = await HiringApplication.findById(interview.application);
        if (application) {
            await sendHiringEmail({
                eventKey: `interview_cancelled:${interview._id}:deleted`,
                type: EMAIL_TYPES.INTERVIEW_CANCELLED,
                application,
                context: { interviewType: interview.type },
            });
        }
        return { status: true, statusCode: 200 };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const upsertCandidateEvaluationQuery = async (identifier, payload, adminId) => {
    try {
        const application = await findApplication(identifier);
        if (!application) return { status: false, statusCode: 404, message: "Application not found" };
        let evaluation = await CandidateEvaluation.findOne({ application: application._id });
        if (!evaluation) {
            evaluation = new CandidateEvaluation({ application: application._id, createdBy: adminId || null });
        }
        const wasNew = evaluation.isNew;
        evaluation.criteria = payload.criteria;
        evaluation.evidence = payload.evidence;
        evaluation.strengths = payload.strengths;
        evaluation.concerns = payload.concerns || "";
        evaluation.recommendation = payload.recommendation;
        evaluation.updatedBy = adminId || null;
        await evaluation.save();
        await appendActivity(application, {
            action: "Candidate evaluation saved",
            detail: `${evaluation.weightedScore.toFixed(1)} / 5 · ${evaluation.recommendation}`,
            actorId: adminId,
            actorLabel: "Hiring Admin",
        });
        await application.save();
        return { status: true, statusCode: wasNew ? 201 : 200, evaluation };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const getCandidateEvaluationQuery = async (identifier) => {
    try {
        const application = await findApplication(identifier);
        if (!application) return { status: false, statusCode: 404, message: "Application not found" };
        const evaluation = await CandidateEvaluation.findOne({ application: application._id }).lean();
        return { status: true, statusCode: 200, evaluation };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const getHiringDashboardQuery = async () => {
    try {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setUTCHours(0, 0, 0, 0);
        startOfWeek.setUTCDate(startOfWeek.getUTCDate() - ((startOfWeek.getUTCDay() + 6) % 7));
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 7);

        const [
            jobs,
            stageCounts,
            interviewCounts,
            interviewsThisWeek,
            assessmentsToReview,
            decisionsDue,
            decisionApplications,
            upcomingInterviews,
        ] =
            await Promise.all([
                Job.find({ status: "Active" }).sort({ createdAt: -1 }).lean(),
                HiringApplication.aggregate([
                    { $match: { archivedAt: null } },
                    { $group: { _id: { job: "$job", stage: "$stage" }, count: { $sum: 1 } } },
                ]),
                HiringInterview.aggregate([
                    { $match: { status: { $ne: "Cancelled" } } },
                    {
                        $lookup: {
                            from: "hiringapplications",
                            localField: "application",
                            foreignField: "_id",
                            as: "applicationRecord",
                        },
                    },
                    { $unwind: "$applicationRecord" },
                    { $group: { _id: "$applicationRecord.job", count: { $sum: 1 } } },
                ]),
                HiringInterview.countDocuments({
                    startAt: { $gte: startOfWeek, $lt: endOfWeek },
                    status: "Scheduled",
                }),
                CandidateAssignment.countDocuments({ status: { $in: ["Submitted", "Under review"] } }),
                HiringApplication.countDocuments({
                    $or: [
                        { stage: "Decision" },
                        { "review.nextReviewDueAt": { $lte: now } },
                    ],
                    archivedAt: null,
                }),
                HiringApplication.find({
                    $or: [
                        { stage: "Decision" },
                        { "review.nextReviewDueAt": { $lte: now } },
                    ],
                    archivedAt: null,
                })
                    .sort({ "review.nextReviewDueAt": 1, stageUpdatedAt: 1 })
                    .limit(10)
                    .select("reference firstName lastName jobSnapshot stage review.nextReviewDueAt stageUpdatedAt")
                    .lean(),
                HiringInterview.find({ startAt: { $gte: now }, status: "Scheduled" })
                    .sort({ startAt: 1 })
                    .limit(10)
                    .select("applicationReference candidateName role startAt endAt type mode interviewers")
                    .lean(),
            ]);

        const countsByJob = new Map();
        stageCounts.forEach(({ _id, count }) => {
            const jobId = String(_id.job);
            const record = countsByJob.get(jobId) || {};
            record[_id.stage] = count;
            countsByJob.set(jobId, record);
        });
        const interviewsByJob = new Map(
            interviewCounts.map((record) => [String(record._id), record.count]),
        );
        const vacancies = jobs.map((job) => {
            const counts = countsByJob.get(String(job._id)) || {};
            const applications = Object.values(counts).reduce((total, count) => total + count, 0);
            const inReview = Object.entries(counts).reduce(
                (total, [stage, count]) =>
                    ["Applied", "Hired", "Rejected"].includes(stage) ? total : total + count,
                0,
            );
            return {
                _id: job._id,
                title: job.title,
                applications,
                inReview,
                interviews: interviewsByJob.get(String(job._id)) || 0,
                decisions: counts.Decision || 0,
                hired: counts.Hired || 0,
                status: "Open",
                closingDate: job.closingDate || null,
                createdAt: job.createdAt,
            };
        });

        const candidatesInReview = vacancies.reduce((total, vacancy) => total + vacancy.inReview, 0);
        return {
            status: true,
            statusCode: 200,
            dashboard: {
                metrics: {
                    activeVacancies: jobs.length,
                    candidatesInReview,
                    interviewsThisWeek,
                    assessmentsToReview,
                    decisionsDue,
                },
                vacancies,
                decisionsDue: decisionApplications.map((application) => ({
                    reference: application.reference,
                    candidateName: `${application.firstName} ${application.lastName}`,
                    role: application.jobSnapshot.title,
                    stage: application.stage,
                    dueAt: application.review?.nextReviewDueAt || application.stageUpdatedAt,
                })),
                upcomingInterviews,
            },
        };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

module.exports = {
    requestCandidateAccessQuery,
    verifyCandidateOtpQuery,
    createHiringApplicationQuery,
    listHiringApplicationsQuery,
    listHiringCandidateOptionsQuery,
    getHiringApplicationQuery,
    getHiringApplicationResumeQuery,
    updateApplicationStageQuery,
    saveApplicationReviewQuery,
    addApplicationNoteQuery,
    getCandidateWorkspaceQuery,
    createCandidateAssignmentQuery,
    listCandidateAssignmentsQuery,
    updateCandidateAssignmentQuery,
    deleteCandidateAssignmentQuery,
    bulkDeleteCandidateAssignmentsQuery,
    resetCandidateAssignmentQuery,
    startCandidateAssignmentQuery,
    submitCandidateAssignmentQuery,
    reviewCandidateAssignmentQuery,
    createInterviewQuery,
    listInterviewsQuery,
    getInterviewCalendarQuery,
    createInterviewAvailabilityQuery,
    deleteInterviewAvailabilityQuery,
    updateInterviewQuery,
    deleteInterviewQuery,
    upsertCandidateEvaluationQuery,
    getCandidateEvaluationQuery,
    getHiringDashboardQuery,
    verifyCandidateAccess,
    sanitizeAssignmentForCandidate,
    sanitizeInterviewForCandidate,
    validateCandidateAnswers,
};
