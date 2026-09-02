const mongoose = require("mongoose");

const declarationSchema = new mongoose.Schema({
    employmentStatus: { type: String, required: true, trim: true },
    occupation: { type: String, required: true, trim: true },
    employerName: { type: String, default: "", trim: true },
    annualIncome: { type: String, required: true, trim: true },
    sourceOfFunds: { type: String, required: true, trim: true },
    estimatedNetWorth: { type: String, required: true, trim: true },
    investmentObjective: { type: String, required: true, trim: true },
    investmentExperience: { type: String, required: true, trim: true },
    taxResidency: { type: String, required: true, trim: true },
    taxIdentificationNumber: { type: String, required: true, trim: true },
    politicallyExposed: { type: String, enum: ["yes", "no"], required: true },
    usPerson: { type: String, enum: ["yes", "no"], required: true },
    beneficialOwner: { type: String, enum: ["yes", "no"], required: true },
}, { _id: false });

const clientSnapshotSchema = new mongoose.Schema({
    clientId: String, firstName: String, lastName: String, fullName: String,
    email: String, phoneNumber: String, countryCode: String, dateOfBirth: String,
    nationality: String, country: String, state: String, city: String,
    postalCode: String, address: String,
}, { _id: false });

const historySchema = new mongoose.Schema({
    action: { type: String, enum: ["submitted", "resubmitted", "approved", "rejected"], required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], required: true },
    remarks: { type: String, default: "", trim: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, refPath: "history.performedByModel", required: true },
    performedByModel: { type: String, enum: ["Client", "User"], required: true },
    performedAt: { type: Date, default: Date.now },
}, { _id: false });

const accountOpeningFormSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true, unique: true, index: true },
    version: { type: String, required: true, trim: true },
    legalName: { type: String, required: true, trim: true },
    signatureUrl: { type: String, default: null, trim: true },
    signaturePublicId: { type: String, default: null, trim: true },
    // Read compatibility for forms submitted before Cloudinary streaming was enabled.
    signatureDataUrl: { type: String, default: null },
    declaration: { type: declarationSchema, required: true },
    clientSnapshot: { type: clientSnapshotSchema, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    adminRemarks: { type: String, default: "", trim: true },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    history: { type: [historySchema], default: [] },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model("AccountOpeningForm", accountOpeningFormSchema);
