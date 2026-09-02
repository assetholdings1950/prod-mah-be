const crypto = require("crypto");
const OtpVerification = require("../models/otpVerification.model");
const sendConsultationOtpMail = require("../emailTemplate/sendConsultationOtpMail");

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const VERIFICATION_EXPIRY_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const getOtpLookupEmail = (email) => `consult:${normalizeEmail(email)}`;
const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest("hex");

const otpMatches = (storedHash, suppliedOtp) => {
    if (!storedHash) return false;
    const suppliedHash = hashOtp(suppliedOtp);
    if (storedHash.length !== suppliedHash.length) return false;
    return crypto.timingSafeEqual(
        Buffer.from(storedHash, "hex"),
        Buffer.from(suppliedHash, "hex")
    );
};

const requestConsultEmailOtp = async (email) => {
    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
        return { status: false, statusCode: 400, message: "Enter a valid email address." };
    }

    const lookupEmail = getOtpLookupEmail(normalizedEmail);
    const existing = await OtpVerification.findOne({ email: lookupEmail }).lean();
    const elapsed = existing?.createdAt ? Date.now() - new Date(existing.createdAt).getTime() : Infinity;

    if (elapsed < RESEND_COOLDOWN_MS && existing?.otpExpires > new Date()) {
        const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return {
            status: false,
            statusCode: 429,
            message: `Please wait ${retryAfterSeconds} seconds before requesting another code.`,
            retryAfterSeconds,
        };
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const record = await OtpVerification.findOneAndUpdate(
        { email: lookupEmail },
        {
            email: lookupEmail,
            otpCode: hashOtp(otp),
            otpExpires: new Date(Date.now() + OTP_EXPIRY_MS),
            attempts: 0,
            verified: false,
            verificationToken: null,
            verifiedAt: null,
            verificationExpires: null,
            createdAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
        await sendConsultationOtpMail(normalizedEmail, otp);
    } catch (error) {
        await OtpVerification.deleteOne({ _id: record._id });
        throw error;
    }

    return {
        status: true,
        statusCode: 200,
        message: "A six-digit verification code has been sent to your email.",
        retryAfterSeconds: RESEND_COOLDOWN_MS / 1000,
    };
};

const verifyConsultEmailOtp = async (email, otp) => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedOtp = String(otp || "").trim();

    if (!EMAIL_PATTERN.test(normalizedEmail) || !/^\d{6}$/.test(normalizedOtp)) {
        return { status: false, statusCode: 400, message: "Enter a valid email and six-digit OTP." };
    }

    const entry = await OtpVerification.findOne({ email: getOtpLookupEmail(normalizedEmail) });
    if (!entry || !entry.otpCode) {
        return { status: false, statusCode: 400, message: "Request a new verification code." };
    }
    if (!entry.otpExpires || entry.otpExpires < new Date()) {
        await OtpVerification.deleteOne({ _id: entry._id });
        return { status: false, statusCode: 400, message: "OTP expired. Request a new code." };
    }
    if (!otpMatches(entry.otpCode, normalizedOtp)) {
        entry.attempts = (entry.attempts || 0) + 1;
        if (entry.attempts >= MAX_ATTEMPTS) {
            await OtpVerification.deleteOne({ _id: entry._id });
            return { status: false, statusCode: 429, message: "Too many incorrect attempts. Request a new code." };
        }
        await entry.save();
        return { status: false, statusCode: 400, message: "Invalid verification code." };
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    entry.otpCode = null;
    entry.otpExpires = null;
    entry.attempts = 0;
    entry.verified = true;
    entry.verificationToken = verificationToken;
    entry.verifiedAt = new Date();
    entry.verificationExpires = new Date(Date.now() + VERIFICATION_EXPIRY_MS);
    await entry.save();

    return {
        status: true,
        statusCode: 200,
        message: "Email verified successfully.",
        verificationToken,
    };
};

const hasValidConsultEmailVerification = async (email, verificationToken) => {
    if (!verificationToken || typeof verificationToken !== "string") return false;

    return Boolean(await OtpVerification.exists({
        email: getOtpLookupEmail(email),
        verified: true,
        verificationToken,
        verificationExpires: { $gt: new Date() },
    }));
};

const consumeConsultEmailVerification = (email, verificationToken) =>
    OtpVerification.deleteOne({
        email: getOtpLookupEmail(email),
        verified: true,
        verificationToken,
    });

module.exports = {
    normalizeEmail,
    requestConsultEmailOtp,
    verifyConsultEmailOtp,
    hasValidConsultEmailVerification,
    consumeConsultEmailVerification,
};
