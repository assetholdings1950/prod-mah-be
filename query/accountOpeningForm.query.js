const AccountOpeningForm = require("../models/accountOpeningForm.model");
const Client = require("../models/client.model");
const { default: sendNotificationMail } = require("../emailTemplate/sendNotificationMail");
const cloudinary = require("../utils/cloudinary");
const { uploadBufferToCloudinary } = require("../services/cloudinaryUpload");

const REQUIRED_PROFILE_FIELDS = ["phoneNumber", "country", "city", "countryCode", "postalCode", "address"];
const DECLARATION_FIELDS = ["employmentStatus", "occupation", "annualIncome", "sourceOfFunds", "estimatedNetWorth", "investmentObjective", "investmentExperience", "taxResidency", "taxIdentificationNumber", "politicallyExposed", "usPerson", "beneficialOwner"];

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function clientSnapshot(client) {
    return {
        clientId: client.clientId, firstName: client.firstName, lastName: client.lastName,
        fullName: client.fullName, email: client.email, phoneNumber: client.phoneNumber,
        countryCode: client.countryCode, dateOfBirth: client.dateOfBirth,
        nationality: client.nationality, country: client.country, state: client.state,
        city: client.city, postalCode: client.postalCode, address: client.address,
    };
}

function signatureBuffer(dataUrl) {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!match) throw httpError(400, "Signature must be a valid PNG, JPEG, or WebP image.");
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) throw httpError(400, "The signature image is empty.");
    if (buffer.length > 2 * 1024 * 1024) throw httpError(413, "The signature image must be smaller than 2 MB.");
    return buffer;
}

async function submitAccountOpeningForm({ clientId, payload }) {
    const client = await Client.findById(clientId);
    if (!client) throw httpError(404, "Client not found.");
    const missing = REQUIRED_PROFILE_FIELDS.filter((field) => !String(client[field] || "").trim());
    if (missing.length) throw httpError(400, `Complete your profile before submitting: ${missing.join(", ")}.`);
    if (!payload?.version || !payload?.legalName?.trim() || !payload?.signatureDataUrl?.startsWith("data:image/")) {
        throw httpError(400, "Document version, matching legal name, and drawn signature are required.");
    }
    const expectedName = [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || String(client.fullName || "").trim();
    if (!expectedName || payload.legalName.trim().toLowerCase() !== expectedName.toLowerCase()) {
        throw httpError(400, "Legal name must exactly match the client profile.");
    }
    if (!payload.declaration || DECLARATION_FIELDS.some((field) => !String(payload.declaration[field] || "").trim())) {
        throw httpError(400, "All required declaration fields must be completed.");
    }

    const existing = await AccountOpeningForm.findOne({ client: clientId });
    if (existing?.status === "approved") throw httpError(409, "The account opening form is already approved.");
    if (existing?.status === "pending") throw httpError(409, "The account opening form is already pending admin review.");

    const now = new Date();
    const action = existing ? "resubmitted" : "submitted";
    let uploadedSignature;
    try {
        uploadedSignature = await uploadBufferToCloudinary(signatureBuffer(payload.signatureDataUrl), {
            folder: `clients/${client._id}/account-opening`,
            public_id: "signature",
            format: "png",
        });
    } catch (error) {
        if (error.status) throw error;
        throw httpError(502, `Signature upload failed: ${error.message}`);
    }
    const update = {
        version: payload.version, legalName: payload.legalName.trim(),
        signatureUrl: uploadedSignature.secureUrl, signaturePublicId: uploadedSignature.publicId,
        declaration: payload.declaration, clientSnapshot: clientSnapshot(client), status: "pending",
        adminRemarks: "", submittedAt: now, reviewedAt: null, reviewedBy: null,
    };
    const historyEntry = { action, status: "pending", performedBy: clientId, performedByModel: "Client", performedAt: now };
    let form;
    if (existing) {
        Object.assign(existing, update);
        existing.signatureDataUrl = undefined;
        existing.history.push(historyEntry);
        form = await existing.save();
    } else {
        form = await AccountOpeningForm.create({ client: clientId, ...update, history: [historyEntry] });
    }
    client.accountForm = form._id;
    await client.save();

    await Promise.all([
        sendNotificationMail({
            to: client.email,
            subject: "Account Opening Form Submitted | Merlion Asset Holdings",
            title: "Account Form Pending Approval",
            message: "Your signed account opening declaration has been submitted successfully and is now awaiting administrator review.",
            details: [{ label: "Form ID", value: form._id.toString() }, { label: "Submitted", value: now.toUTCString() }, { label: "Status", value: "Pending Approval" }],
        }),
        sendNotificationMail({
            to: process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com",
            subject: `Account Opening Form Awaiting Review: ${expectedName}`,
            title: "New Account Form Request",
            message: `${expectedName} (${client.clientId}) submitted an account opening form that requires review.`,
            details: [{ label: "Client", value: expectedName }, { label: "Email", value: client.email }, { label: "Client ID", value: client.clientId }, { label: "Status", value: "Pending Approval" }],
        }),
    ]);
    return form;
}

async function getMyAccountOpeningForm(clientId) {
    return AccountOpeningForm.findOne({ client: clientId }).lean();
}

async function getClientAccountOpeningForm(clientId) {
    return AccountOpeningForm.findOne({ client: clientId }).populate("reviewedBy", "firstName lastName email").lean();
}

async function updateAccountOpeningStatus({ formId, status, remarks, adminId }) {
    if (!["approved", "rejected"].includes(status)) throw httpError(400, "Status must be approved or rejected.");
    if (status === "rejected" && !String(remarks || "").trim()) throw httpError(400, "Remarks are required when rejecting a form.");
    const form = await AccountOpeningForm.findById(formId);
    if (!form) throw httpError(404, "Account opening form not found.");
    form.status = status;
    form.adminRemarks = String(remarks || "").trim();
    form.reviewedAt = new Date();
    form.reviewedBy = adminId;
    form.history.push({ action: status, status, remarks: form.adminRemarks, performedBy: adminId, performedByModel: "User", performedAt: form.reviewedAt });
    await form.save();
    const client = await Client.findById(form.client).select("email firstName lastName clientId");
    if (client) await sendNotificationMail({
        to: client.email,
        subject: `Account Opening Form ${status === "approved" ? "Approved" : "Requires Attention"} | Merlion Asset Holdings`,
        title: status === "approved" ? "Account Form Approved" : "Account Form Rejected",
        message: status === "approved" ? "Your account opening form has been approved. You are now eligible to submit withdrawal and portfolio payout requests." : "Your account opening form was not approved. Review the administrator remarks and resubmit corrected information.",
        details: [{ label: "Client ID", value: client.clientId }, { label: "Status", value: status.toUpperCase() }, ...(form.adminRemarks ? [{ label: "Administrator Remarks", value: form.adminRemarks }] : [])],
    });
    return form;
}

async function deleteAccountOpeningForm({ formId, adminId }) {
    const form = await AccountOpeningForm.findById(formId);
    if (!form) throw httpError(404, "Account opening form not found.");
    const client = await Client.findById(form.client).select("email firstName lastName clientId");
    if (form.signaturePublicId) {
        try {
            await cloudinary.uploader.destroy(form.signaturePublicId, { resource_type: "image", invalidate: true });
        } catch (error) {
            throw httpError(502, `Could not delete the Cloudinary signature: ${error.message}`);
        }
    }
    await AccountOpeningForm.deleteOne({ _id: formId });
    await Client.updateOne({ _id: form.client }, { $unset: { accountForm: 1 }, $set: { updatedBy: adminId } });
    if (client) await sendNotificationMail({
        to: client.email,
        subject: "Account Opening Form Removed | Merlion Asset Holdings",
        title: "Account Form Removed",
        message: "Your account opening form record was removed by an administrator. Withdrawal eligibility has been revoked until a new form is submitted and approved.",
        details: [{ label: "Client ID", value: client.clientId }, { label: "Status", value: "Not Submitted" }],
    });
    return form;
}

async function ensureAccountOpeningApproved(clientId) {
    const approved = await AccountOpeningForm.exists({ client: clientId, status: "approved" });
    if (!approved) throw httpError(403, "Your account opening form must be approved before you can withdraw funds.");
}

module.exports = { submitAccountOpeningForm, getMyAccountOpeningForm, getClientAccountOpeningForm, updateAccountOpeningStatus, deleteAccountOpeningForm, ensureAccountOpeningApproved };
