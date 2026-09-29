const mongoose = require("mongoose");

const commissionTierPolicySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    commissionRate: { type: Number, required: true, min: 0, max: 100 },
    active: { type: Boolean, default: true, index: true },
    isDefault: { type: Boolean, default: false },
    description: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true, versionKey: false });

commissionTierPolicySchema.index({ isDefault: 1, active: 1 });

module.exports = mongoose.models.CommissionTierPolicy
    || mongoose.model("CommissionTierPolicy", commissionTierPolicySchema);
