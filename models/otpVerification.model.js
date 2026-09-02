const mongoose = require("mongoose");

const OtpSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    otpCode: { type: String },
    otpExpires: { type: Date },
    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    verificationToken: { type: String, default: null },
    verifiedAt: { type: Date, default: null },
    verificationExpires: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Otp', OtpSchema);
