const { submitAccountOpeningForm, getMyAccountOpeningForm, getClientAccountOpeningForm, updateAccountOpeningStatus, deleteAccountOpeningForm } = require("../query/accountOpeningForm.query");
const { logActivity } = require("../utils/activityLogger");
const AccountOpeningForm = require("../models/accountOpeningForm.model");
const Client = require("../models/client.model");
const { buildAccountOpeningPdf } = require("../services/accountOpeningPdf.service");

const reply = (res, statusCode, data, message) => res.status(statusCode).json({ status: true, statusCode, message, data });
const fail = (res, error) => res.status(error.status || error.status_code || 500).json({
    status: false,
    statusCode: error.status || error.status_code || 500,
    message: error.message || "Account form request failed.",
});

exports.submitAccountOpeningFormController = async (req, res, next) => {
    try {
        if (req.user.model !== "Client") return res.status(403).json({ status: false, message: "Only clients can submit this form." });
        const data = await submitAccountOpeningForm({ clientId: req.user.sub, payload: req.body });
        logActivity({ userId: req.user.sub, userModel: "Client", action: "account_form.submitted", category: "account", description: "Account opening form submitted for approval", performedBy: { id: req.user.sub, role: "Client" }, notification: { title: "Account opening form submitted", priority: "medium", actionRequired: true, entity: { model: "AccountOpeningForm", id: data._id, reference: `AF-${String(data._id).slice(-8).toUpperCase()}`, label: "Account Form", url: `/clients/${req.user.sub}`, state: data.status || "pending" }, footprints: [{ label: "Form submitted", description: "Client completed the account opening declaration" }, { label: "Signature stored", description: "Electronic signature and declaration were persisted" }, { label: "Admin notified", description: "Form is awaiting administrator review" }] } });
        return reply(res, 201, data, "Account opening form submitted for approval.");
    } catch (error) { return fail(res, error); }
};

exports.getMyAccountOpeningFormController = async (req, res, next) => {
    try { return reply(res, 200, await getMyAccountOpeningForm(req.user.sub), "Account opening form status fetched."); }
    catch (error) { return fail(res, error); }
};

exports.downloadMyAccountOpeningFormController = async (req, res) => {
    try {
        if (req.user.model !== "Client") return res.status(403).json({ status: false, message: "Only clients can download this application." });
        const [form, client] = await Promise.all([
            AccountOpeningForm.findOne({ client: req.user.sub, status: "approved" }).populate("reviewedBy", "firstName lastName email").lean(),
            Client.findById(req.user.sub).select("firstName lastName fullName email clientId phoneNumber countryCode dateOfBirth nationality country city postalCode address profileImage").lean(),
        ]);
        if (!form) return res.status(403).json({ status: false, message: "The application can be downloaded after administrator approval." });
        if (!client) return res.status(404).json({ status: false, message: "Client not found." });

        const pdf = await buildAccountOpeningPdf({ form, client });
        const safeClientId = String(client.clientId || client._id).replace(/[^a-zA-Z0-9_-]/g, "-");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="account-opening-${safeClientId}.pdf"`);
        res.setHeader("Content-Length", pdf.length);
        res.setHeader("Cache-Control", "private, no-store");
        return res.end(pdf);
    } catch (error) {
        console.error("Account opening PDF generation failed:", error);
        return res.status(500).json({ status: false, message: "Could not generate the application PDF." });
    }
};

exports.getClientAccountOpeningFormController = async (req, res, next) => {
    try { return reply(res, 200, await getClientAccountOpeningForm(req.params.clientId), "Account opening form fetched."); }
    catch (error) { return fail(res, error); }
};

exports.updateAccountOpeningStatusController = async (req, res, next) => {
    try {
        const data = await updateAccountOpeningStatus({ formId: req.params.id, status: req.body?.status, remarks: req.body?.remarks, adminId: req.user.sub });
        logActivity({ userId: data.client, userModel: "Client", action: `account_form.${data.status}`, category: "account", description: `Account opening form ${data.status}`, metadata: { remarks: data.adminRemarks }, performedBy: { id: req.user.sub, role: "admin" }, notification: { actionRequired: false, priority: data.status === "rejected" ? "high" : "low", entity: { model: "AccountOpeningForm", id: data._id, reference: `AF-${String(data._id).slice(-8).toUpperCase()}`, label: "Account Form", url: `/clients/${data.client}`, state: data.status } } });
        return reply(res, 200, data, `Account opening form ${data.status}.`);
    } catch (error) { return fail(res, error); }
};

exports.deleteAccountOpeningFormController = async (req, res, next) => {
    try {
        const data = await deleteAccountOpeningForm({ formId: req.params.id, adminId: req.user.sub });
        logActivity({ userId: data.client, userModel: "Client", action: "account_form.deleted", category: "account", description: "Account opening form deleted by admin", performedBy: { id: req.user.sub, role: "admin" } });
        return reply(res, 200, null, "Account opening form deleted.");
    } catch (error) { return fail(res, error); }
};
