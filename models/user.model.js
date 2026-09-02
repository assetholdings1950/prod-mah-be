const mongoose = require("mongoose");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2")
const mongoosePaginate = require("mongoose-paginate-v2")

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    otpCode: { type: String },
    otpExpires: { type: Date },
    role: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role", default: [] }],
    refreshToken: { type: String, default: null }, // NEW FIELD
    referralCode: { type: String, default: null },
    fullName: { type: String, default: null },
    firstName: { type: String, default: null },
    lastName: { type: String, default: null },
    country: { type: String, default: null },
    countryCode: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    profileImage: { type: String, default: null },
    status: {
        type: String,
        enum: [
            "pending",
            "active",
            "suspended",
            "blocked",
            "closed"
        ],
        default: "pending"
    },
    kycStatus: {
        type: String,
        enum: [
            "pending",
            "under_review",
            "approved",
            "rejected"
        ],
        default: "pending"
    },
    kycVerification: {
        liveSelfie: { type: String, default: null },
        governmentIdFront: { type: String, default: null },
        governmentIdBack: { type: String, default: null },
        submittedAt: { type: Date, default: null },
        verifiedAt: { type: Date, default: null }
    }
}, { timestamps: true });

userSchema.plugin(aggregatePaginate)
userSchema.plugin(mongoosePaginate)

module.exports = mongoose.model('User', userSchema);
