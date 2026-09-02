const {
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
    requestCandidateAccessQuery,
    verifyCandidateOtpQuery,
} = require("../query/hiring.query");
const { downloadCloudinaryAsset, pdfFilename } = require("../services/cloudinaryDownload.service");
const {
    normalizeEmail,
    hasValidConsultEmailVerification,
    consumeConsultEmailVerification,
} = require("../services/consultEmailVerification.service");

const fail = (res, result) =>
    res.status(result.statusCode || 500).json({ success: false, message: result.message });

const run = (handler) => async (req, res, next) => {
    try {
        await handler(req, res);
    } catch (error) {
        next(error);
    }
};

const createHiringApplicationController = run(async (req, res) => {
    const normalizedEmail = normalizeEmail(req.body?.email);
    const verificationToken = req.body?.emailVerificationToken;
    const emailVerified = await hasValidConsultEmailVerification(
        normalizedEmail,
        verificationToken
    );
    if (!emailVerified) {
        return res.status(403).json({
            success: false,
            message: "Verify your email address before submitting your application.",
        });
    }

    const result = await createHiringApplicationQuery({
        ...req.body,
        email: normalizedEmail,
    });
    if (!result.status) return fail(res, result);
    await consumeConsultEmailVerification(normalizedEmail, verificationToken);
    res.set("Cache-Control", "no-store");
    return res.status(result.statusCode).json({
        success: true,
        message: "Application submitted successfully",
        data: {
            reference: result.application.reference,
            trackingToken: result.trackingToken,
            stage: result.application.stage,
            submittedAt: result.application.submittedAt,
        },
    });
});

const listHiringApplicationsController = run(async (req, res) => {
    const result = await listHiringApplicationsQuery(req.query);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.applications, pagination: result.pagination });
});

const listHiringCandidateOptionsController = run(async (req, res) => {
    const result = await listHiringCandidateOptionsQuery(req.query);
    if (!result.status) return fail(res, result);
    res.set("Cache-Control", "private, max-age=30");
    return res.status(200).json({ success: true, data: result.candidates });
});

const downloadHiringApplicationResumeController = async (req, res, next) => {
    try {
        const result = await getHiringApplicationResumeQuery(req.params.id);
        if (!result.status) return fail(res, result);
        const { application } = result;
        const file = await downloadCloudinaryAsset(application.resume);
        const safeName = pdfFilename(
            application.resume.originalFilename,
            `${application.reference}-resume.pdf`,
        );
        res.set("Cache-Control", "private, no-store");
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `attachment; filename="${safeName}"`);
        return res.status(200).send(file);
    } catch (error) {
        if (error?.response) {
            return res.status(502).json({ success: false, message: "Cloudinary could not provide this resume" });
        }
        next(error);
    }
};

const getHiringApplicationController = run(async (req, res) => {
    const result = await getHiringApplicationQuery(req.params.id);
    if (!result.status) return fail(res, result);
    return res.status(200).json({
        success: true,
        data: {
            application: result.application,
            assignments: result.assignments,
            interviews: result.interviews,
            evaluation: result.evaluation,
        },
    });
});

const updateApplicationStageController = run(async (req, res) => {
    const result = await updateApplicationStageQuery(req.params.id, req.body.stage, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.application });
});

const saveApplicationReviewController = run(async (req, res) => {
    const result = await saveApplicationReviewQuery(req.params.id, req.body, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.review });
});

const addApplicationNoteController = run(async (req, res) => {
    const result = await addApplicationNoteQuery(req.params.id, req.body.body, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(201).json({ success: true, data: result.note });
});

const getCandidateWorkspaceController = run(async (req, res) => {
    const result = await getCandidateWorkspaceQuery(
        req.query.reference,
        req.get("x-hiring-token") || req.query.token,
        req.query.access,
    );
    if (!result.status) return fail(res, result);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ success: true, data: result.workspace });
});

const requestCandidateAccessController = run(async (req, res) => {
    const result = await requestCandidateAccessQuery(req.body.email);
    if (!result.status) return fail(res, result);
    return res.status(200).json({
        success: true,
        message: "If applications exist for this email, a verification OTP has been sent.",
    });
});

const verifyCandidateOtpController = run(async (req, res) => {
    const result = await verifyCandidateOtpQuery(req.body.email, req.body.otp);
    if (!result.status) return fail(res, result);
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
        success: true,
        data: { accessToken: result.accessToken },
    });
});

const createCandidateAssignmentController = run(async (req, res) => {
    const result = await createCandidateAssignmentQuery(req.body, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(201).json({ success: true, data: result.assignment });
});

const listCandidateAssignmentsController = run(async (req, res) => {
    const result = await listCandidateAssignmentsQuery(req.query);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.assignments, pagination: result.pagination });
});

const updateCandidateAssignmentController = run(async (req, res) => {
    const result = await updateCandidateAssignmentQuery(req.params.id, req.body, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.assignment });
});

const deleteCandidateAssignmentController = run(async (req, res) => {
    const result = await deleteCandidateAssignmentQuery(req.params.id);
    if (!result.status) return fail(res, result);
    return res.status(200).json({
        success: true,
        message: "Candidate assignment deleted",
        data: { deletedCount: result.deletedCount },
    });
});

const bulkDeleteCandidateAssignmentsController = run(async (req, res) => {
    const result = await bulkDeleteCandidateAssignmentsQuery(req.body.ids);
    if (!result.status) return fail(res, result);
    return res.status(200).json({
        success: true,
        message: "Candidate assignments deleted",
        data: { deletedCount: result.deletedCount },
    });
});

const resetCandidateAssignmentController = run(async (req, res) => {
    const result = await resetCandidateAssignmentQuery(
        req.params.id,
        req.body,
        req.user?.sub,
    );
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.assignment });
});

const startCandidateAssignmentController = run(async (req, res) => {
    const result = await startCandidateAssignmentQuery(
        req.params.id,
        req.body.reference,
        req.body.token,
        req.body.access,
    );
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.assignment });
});

const submitCandidateAssignmentController = run(async (req, res) => {
    const result = await submitCandidateAssignmentQuery(req.params.id, req.body);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, message: "Assignment submitted", data: result.assignment });
});

const reviewCandidateAssignmentController = run(async (req, res) => {
    const result = await reviewCandidateAssignmentQuery(req.params.id, req.body, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.assignment });
});

const createInterviewController = run(async (req, res) => {
    const result = await createInterviewQuery(req.body, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(201).json({ success: true, data: result.interview });
});

const listInterviewsController = run(async (req, res) => {
    const result = await listInterviewsQuery(req.query);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.interviews });
});

const getInterviewCalendarController = run(async (req, res) => {
    const result = await getInterviewCalendarQuery(req.query);
    if (!result.status) return fail(res, result);
    res.set("Cache-Control", "private, max-age=15");
    return res.status(200).json({ success: true, data: result.calendar });
});

const createInterviewAvailabilityController = run(async (req, res) => {
    const result = await createInterviewAvailabilityQuery(req.body, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(201).json({ success: true, data: result.availability });
});

const deleteInterviewAvailabilityController = run(async (req, res) => {
    const result = await deleteInterviewAvailabilityQuery(req.params.id);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, message: "Availability rule deleted" });
});

const updateInterviewController = run(async (req, res) => {
    const result = await updateInterviewQuery(req.params.id, req.body, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.interview });
});

const deleteInterviewController = run(async (req, res) => {
    const result = await deleteInterviewQuery(req.params.id);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, message: "Interview deleted successfully" });
});

const saveCandidateEvaluationController = run(async (req, res) => {
    const result = await upsertCandidateEvaluationQuery(req.params.id, req.body, req.user?.sub);
    if (!result.status) return fail(res, result);
    return res.status(result.statusCode).json({ success: true, data: result.evaluation });
});

const getCandidateEvaluationController = run(async (req, res) => {
    const result = await getCandidateEvaluationQuery(req.params.id);
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.evaluation });
});

const getHiringDashboardController = run(async (req, res) => {
    const result = await getHiringDashboardQuery();
    if (!result.status) return fail(res, result);
    return res.status(200).json({ success: true, data: result.dashboard });
});

module.exports = {
    requestCandidateAccessController,
    verifyCandidateOtpController,
    createHiringApplicationController,
    listHiringApplicationsController,
    listHiringCandidateOptionsController,
    getHiringApplicationController,
    downloadHiringApplicationResumeController,
    updateApplicationStageController,
    saveApplicationReviewController,
    addApplicationNoteController,
    getCandidateWorkspaceController,
    createCandidateAssignmentController,
    listCandidateAssignmentsController,
    updateCandidateAssignmentController,
    deleteCandidateAssignmentController,
    bulkDeleteCandidateAssignmentsController,
    resetCandidateAssignmentController,
    startCandidateAssignmentController,
    submitCandidateAssignmentController,
    reviewCandidateAssignmentController,
    createInterviewController,
    listInterviewsController,
    getInterviewCalendarController,
    createInterviewAvailabilityController,
    deleteInterviewAvailabilityController,
    updateInterviewController,
    deleteInterviewController,
    saveCandidateEvaluationController,
    getCandidateEvaluationController,
    getHiringDashboardController,
};
