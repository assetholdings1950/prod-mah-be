const {
    createHiringInterestQuery,
    listHiringInterestsQuery,
    getHiringInterestResumeQuery,
} = require("../query/hiringInterest.query");
const { downloadCloudinaryAsset, pdfFilename } = require("../services/cloudinaryDownload.service");
const {
    normalizeEmail,
    hasValidConsultEmailVerification,
    consumeConsultEmailVerification,
} = require("../services/consultEmailVerification.service");

const fail = (res, result) =>
    res.status(result.statusCode || 500).json({ success: false, message: result.message });

const createHiringInterestController = async (req, res, next) => {
    try {
        const normalizedEmail = normalizeEmail(req.body?.email);
        const verificationToken = req.body?.emailVerificationToken;
        const emailVerified = await hasValidConsultEmailVerification(
            normalizedEmail,
            verificationToken
        );
        if (!emailVerified) {
            return res.status(403).json({
                success: false,
                message: "Verify your email address before submitting your interest.",
            });
        }

        const result = await createHiringInterestQuery({
            ...req.body,
            email: normalizedEmail,
        });
        if (!result.status) return fail(res, result);
        await consumeConsultEmailVerification(normalizedEmail, verificationToken);
        res.set("Cache-Control", "no-store");
        return res.status(201).json({
            success: true,
            message: "Your interest has been received",
            data: {
                reference: result.interest.reference,
                submittedAt: result.interest.submittedAt,
            },
        });
    } catch (error) {
        next(error);
    }
};

const listHiringInterestsController = async (req, res, next) => {
    try {
        const result = await listHiringInterestsQuery(req.query);
        if (!result.status) return fail(res, result);
        res.set("Cache-Control", "private, max-age=15");
        return res.status(200).json({
            success: true,
            data: result.interests,
            pagination: result.pagination,
        });
    } catch (error) {
        next(error);
    }
};

const downloadHiringInterestResumeController = async (req, res, next) => {
    try {
        const result = await getHiringInterestResumeQuery(req.params.id);
        if (!result.status) return fail(res, result);
        const resume = result.interest.resume;
        const file = await downloadCloudinaryAsset(resume);
        const safeName = pdfFilename(resume.originalFilename, `${result.interest.reference}-resume.pdf`);
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

module.exports = {
    createHiringInterestController,
    listHiringInterestsController,
    downloadHiringInterestResumeController,
};
