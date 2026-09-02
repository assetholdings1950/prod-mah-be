const HiringCounter = require("../models/hiringCounter.model");
const HiringInterest = require("../models/hiringInterest.model");
const mongoose = require("mongoose");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatError = (error) => {
    if (error?.name === "ValidationError") {
        return Object.values(error.errors)
            .map((item) => item.message)
            .join(", ");
    }
    return error.message;
};

const normalizeResume = (asset) => ({
    assetType: "resume",
    secureUrl: asset?.secureUrl || asset?.url || asset?.secure_url,
    publicId: asset?.publicId || asset?.public_id || "",
    resourceType: asset?.resourceType || asset?.resource_type || "image",
    format: String(asset?.format || "pdf").toLowerCase(),
    bytes: Number(asset?.bytes || asset?.optimizedBytes || 0),
    originalFilename: asset?.originalFilename || asset?.filename || "resume.pdf",
    originalBytes: Number(asset?.originalBytes || asset?.bytes || 0),
    optimizedBytes: Number(asset?.optimizedBytes || asset?.bytes || 0),
    compressionApplied: Boolean(asset?.compressionApplied),
});

const nextInterestReference = async () => {
    const year = new Date().getUTCFullYear();
    const counter = await HiringCounter.findOneAndUpdate(
        { key: `interest-${year}` },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return `MAH-EOI-${year}-${String(counter.value).padStart(4, "0")}`;
};

const createHiringInterestQuery = async (payload = {}) => {
    try {
        const interest = await HiringInterest.create({
            reference: await nextInterestReference(),
            firstName: payload.firstName,
            lastName: payload.lastName,
            email: payload.email,
            coverLetter: payload.coverLetter,
            resume: normalizeResume(payload.resume),
        });
        return { status: true, statusCode: 201, interest };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const listHiringInterestsQuery = async ({ page = 1, limit = 20, search } = {}) => {
    try {
        const normalizedPage = Math.max(Number(page) || 1, 1);
        const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
        const filter = {};
        if (search) {
            const regex = new RegExp(escapeRegex(String(search).trim()), "i");
            filter.$or = [
                { reference: regex },
                { firstName: regex },
                { lastName: regex },
                { email: regex },
            ];
        }
        const [interests, totalDocs] = await Promise.all([
            HiringInterest.find(filter)
                .sort({ submittedAt: -1, _id: -1 })
                .skip((normalizedPage - 1) * normalizedLimit)
                .limit(normalizedLimit)
                .lean(),
            HiringInterest.countDocuments(filter),
        ]);
        return {
            status: true,
            interests,
            pagination: {
                page: normalizedPage,
                limit: normalizedLimit,
                totalDocs,
                totalPages: Math.max(Math.ceil(totalDocs / normalizedLimit), 1),
            },
        };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const getHiringInterestResumeQuery = async (identifier) => {
    try {
        const filter = mongoose.isValidObjectId(identifier)
            ? { _id: identifier }
            : { reference: String(identifier || "").trim().toUpperCase() };
        const interest = await HiringInterest.findOne(filter).select("reference resume").lean();
        if (!interest?.resume?.secureUrl) {
            return { status: false, statusCode: 404, message: "Resume not found" };
        }
        if (!/^https:\/\/res\.cloudinary\.com\//i.test(interest.resume.secureUrl)) {
            return { status: false, statusCode: 400, message: "Resume URL is not trusted" };
        }
        return { status: true, interest };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

module.exports = {
    createHiringInterestQuery,
    listHiringInterestsQuery,
    getHiringInterestResumeQuery,
};
