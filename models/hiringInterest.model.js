const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema(
    {
        assetType: { type: String, enum: ["resume"], default: "resume" },
        secureUrl: { type: String, required: [true, "Resume URL is required"] },
        publicId: { type: String, default: "" },
        resourceType: { type: String, enum: ["image", "raw"], default: "image" },
        format: { type: String, default: "pdf" },
        bytes: { type: Number, default: 0, min: 0 },
        originalFilename: { type: String, required: [true, "Resume filename is required"] },
        originalBytes: { type: Number, default: 0, min: 0 },
        optimizedBytes: {
            type: Number,
            default: 0,
            min: 0,
            max: [5 * 1024 * 1024, "Resume must not exceed 5MB"],
        },
        compressionApplied: { type: Boolean, default: false },
    },
    { _id: false },
);

const hiringInterestSchema = new mongoose.Schema(
    {
        reference: { type: String, required: true, unique: true, index: true },
        firstName: { type: String, required: [true, "First name is required"], trim: true, maxlength: 80 },
        lastName: { type: String, required: [true, "Last name is required"], trim: true, maxlength: 80 },
        email: {
            type: String,
            required: [true, "Email address is required"],
            trim: true,
            lowercase: true,
            match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address"],
        },
        coverLetter: {
            type: String,
            required: [true, "Cover letter is required"],
            trim: true,
            minlength: [80, "Cover letter must be at least 80 characters"],
            maxlength: [10000, "Cover letter must not exceed 10,000 characters"],
        },
        resume: { type: resumeSchema, required: [true, "Resume is required"] },
        submittedAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true },
);

hiringInterestSchema.index({ email: 1, submittedAt: -1 });
hiringInterestSchema.index({ firstName: "text", lastName: "text", email: "text", reference: "text" });

hiringInterestSchema.pre("validate", function validateResume(next) {
    if (!this.resume) return next();
    const isCloudinary = /^https:\/\/res\.cloudinary\.com\//i.test(this.resume.secureUrl || "");
    if (!isCloudinary) this.invalidate("resume.secureUrl", "Resume must use a Cloudinary URL");
    if (String(this.resume.format || "").toLowerCase() !== "pdf") {
        this.invalidate("resume.format", "Resume must be a PDF document");
    }
    next();
});

module.exports = mongoose.model("HiringInterest", hiringInterestSchema);
