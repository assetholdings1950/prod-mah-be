const express = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const { commonErrors } = require("../errors/error");
const {
    createAssignmentTemplateController,
    listAssignmentTemplatesController,
    getAssignmentTemplateController,
    updateAssignmentTemplateController,
    deleteAssignmentTemplateController,
} = require("../controller/assignmentTemplate.controller");
const {
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
    requestCandidateAccessController,
    verifyCandidateOtpController,
} = require("../controller/hiring.controller");
const {
    listHiringEmailLogsController,
    retryHiringEmailController,
} = require("../controller/hiringEmail.controller");
const {
    createHiringInterestController,
    listHiringInterestsController,
    downloadHiringInterestResumeController,
} = require("../controller/hiringInterest.controller");

const router = express.Router();
const hiringAdmins = ["Hiring-Admin", "Hiring Admin", "Admin", "Super-Admin"];

// Candidate-facing routes use the opaque tracking token returned after application.
router.post("/applications", createHiringApplicationController);
router.post("/interests", createHiringInterestController);
router.post("/candidate/access", requestCandidateAccessController);
router.post("/candidate/access/verify", verifyCandidateOtpController);
router.get("/candidate/workspace", getCandidateWorkspaceController);
router.post("/candidate/assignments/:id/start", startCandidateAssignmentController);
router.post("/candidate/assignments/:id/submit", submitCandidateAssignmentController);

router.use(authenticate, requireRole(hiringAdmins));

router.get("/dashboard", getHiringDashboardController);
router.get("/interests", listHiringInterestsController);
router.get("/interests/:id/resume", downloadHiringInterestResumeController);
router.get("/email-logs", listHiringEmailLogsController);
router.post("/email-logs/:id/retry", retryHiringEmailController);

router.get("/applications", listHiringApplicationsController);
router.get("/application-options", listHiringCandidateOptionsController);
router.get("/applications/:id/resume", downloadHiringApplicationResumeController);
router.get("/applications/:id", getHiringApplicationController);
router.patch("/applications/:id/stage", updateApplicationStageController);
router.put("/applications/:id/review", saveApplicationReviewController);
router.post("/applications/:id/notes", addApplicationNoteController);
router
    .route("/applications/:id/evaluation")
    .get(getCandidateEvaluationController)
    .put(saveCandidateEvaluationController);

router
    .route("/candidate-assignments")
    .get(listCandidateAssignmentsController)
    .post(createCandidateAssignmentController);
router.post("/candidate-assignments/bulk-delete", bulkDeleteCandidateAssignmentsController);
router
    .route("/candidate-assignments/:id")
    .put(updateCandidateAssignmentController)
    .delete(deleteCandidateAssignmentController);
router.put("/candidate-assignments/:id/reset", resetCandidateAssignmentController);
router.put("/candidate-assignments/:id/review", reviewCandidateAssignmentController);

router
    .route("/interviews")
    .get(listInterviewsController)
    .post(createInterviewController);
router.get("/interviews-calendar", getInterviewCalendarController);
router.post("/interview-availability", createInterviewAvailabilityController);
router.delete("/interview-availability/:id", deleteInterviewAvailabilityController);
router
    .route("/interviews/:id")
    .put(updateInterviewController)
    .delete(deleteInterviewController);

router
    .route("/assignment-templates")
    .post(createAssignmentTemplateController)
    .get(listAssignmentTemplatesController);

router
    .route("/assignment-templates/:id")
    .get(getAssignmentTemplateController)
    .put(updateAssignmentTemplateController)
    .delete(deleteAssignmentTemplateController);

router.use(commonErrors);

module.exports = router;
