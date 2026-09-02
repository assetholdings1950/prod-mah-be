const mongoose = require("mongoose");

const isCloudinaryUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
    } catch {
        return false;
    }
};

const HIRING_STAGES = [
    "Applied",
    "Initial review",
    "Screening",
    "Assessment",
    "Role interview",
    "Standards interview",
    "Decision",
    "Hired",
    "Rejected",
];

const assetSchema = new mongoose.Schema(
    {
        assetType: { type: String, enum: ["resume", "introduction_video"], required: true },
        secureUrl: {
            type: String,
            required: true,
            validate: { validator: isCloudinaryUrl, message: "Hiring assets must use a secure Cloudinary URL" },
        },
        publicId: { type: String, default: "" },
        resourceType: { type: String, default: "raw" },
        format: { type: String, default: "" },
        bytes: { type: Number, min: 0 },
        originalFilename: { type: String, required: true },
        originalBytes: { type: Number, min: 0 },
        optimizedBytes: { type: Number, min: 0 },
        compressionApplied: { type: Boolean, default: false },
    },
    { _id: true, timestamps: true },
);

const activitySchema = new mongoose.Schema(
    {
        action: { type: String, required: true, trim: true },
        detail: { type: String, default: "" },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        actorLabel: { type: String, default: "System" },
        visibility: { type: String, enum: ["internal", "candidate"], default: "internal" },
        at: { type: Date, default: Date.now },
    },
    { _id: true },
);

const noteSchema = new mongoose.Schema(
    {
        body: { type: String, required: true, trim: true, maxlength: 5000 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        createdByLabel: { type: String, default: "Hiring Admin" },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: true },
);

const reviewSchema = new mongoose.Schema(
    {
        eligibilityConfirmed: { type: Boolean, default: false },
        experienceRelevant: { type: Boolean, default: false },
        documentsReviewed: { type: Boolean, default: false },
        introductionVideoReviewed: { type: Boolean, default: false },
        conflictCheck: { type: Boolean, default: false },
        notesAdded: { type: Boolean, default: false },
        nextReviewDueAt: { type: Date, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
    },
    { _id: false },
);

const hiringApplicationSchema = new mongoose.Schema(
    {
        reference: { type: String, required: true, unique: true, index: true },
        trackingTokenHash: { type: String, required: true, select: false },
        job: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
        jobSnapshot: {
            title: { type: String, required: true },
            location: { type: String, default: "" },
            type: { type: String, default: "" },
        },
        firstName: { type: String, required: true, trim: true },
        lastName: { type: String, required: true, trim: true },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "A valid email address is required"],
        },
        phoneNumber: { type: String, required: true, trim: true, minlength: 5, maxlength: 24 },
        countryCode: {
            type: String,
            required: true,
            trim: true,
            match: [/^\+\d{1,4}$/, "Country code must use international format, for example +61"],
        },
        country: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        highestQualification: { type: String, required: true, trim: true },
        yearsOfExperience: { type: Number, required: true, min: 0, max: 80 },
        currentRole: { type: String, default: "", trim: true },
        currentCompany: { type: String, default: "", trim: true },
        professionalSummary: { type: String, default: "", maxlength: 5000 },
        motivation: { type: String, required: true, minlength: 80, maxlength: 10000 },
        strengths: { type: [String], default: [] },
        consent: { type: Boolean, required: true, validate: (value) => value === true },
        resume: { type: assetSchema, required: true },
        introductionVideo: { type: assetSchema, default: null },
        stage: { type: String, enum: HIRING_STAGES, default: "Applied", index: true },
        stageUpdatedAt: { type: Date, default: Date.now },
        review: { type: reviewSchema, default: () => ({}) },
        notes: { type: [noteSchema], default: [] },
        activities: { type: [activitySchema], default: [] },
        submittedAt: { type: Date, default: Date.now },
        hiredAt: { type: Date, default: null },
        rejectedAt: { type: Date, default: null },
        archivedAt: { type: Date, default: null },
    },
    { timestamps: true },
);

hiringApplicationSchema.index({ job: 1, email: 1, createdAt: -1 });
hiringApplicationSchema.index({ stage: 1, updatedAt: -1 });
hiringApplicationSchema.index({ archivedAt: 1, submittedAt: -1 });
hiringApplicationSchema.index({ firstName: "text", lastName: "text", email: "text", reference: "text" });

hiringApplicationSchema.pre("validate", function validateHiringAssets(next) {
    if (this.resume?.assetType !== "resume") {
        return next(new Error("A valid resume asset is required"));
    }
    const resumeBytes = Number(this.resume?.optimizedBytes || this.resume?.bytes || 0);
    if (resumeBytes > 5 * 1024 * 1024) {
        return next(new Error("Resume must not exceed 5MB"));
    }
    if (this.introductionVideo) {
        if (this.introductionVideo.assetType !== "introduction_video") {
            return next(new Error("Invalid introduction video asset"));
        }
        const videoBytes = Number(
            this.introductionVideo.optimizedBytes || this.introductionVideo.bytes || 0,
        );
        if (videoBytes > 25 * 1024 * 1024) {
            return next(new Error("Introduction video must not exceed 25MB"));
        }
    }
    next();
});

module.exports = mongoose.model("HiringApplication", hiringApplicationSchema);
module.exports.HIRING_STAGES = HIRING_STAGES;
