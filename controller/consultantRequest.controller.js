const mongoose = require("mongoose");
const ConsultantRequest = require("../models/consultantRequest.model");
const Client = require("../models/client.model");
const sendNotificationMail = require("../emailTemplate/sendNotificationMail").default;
const {
    normalizeEmail,
    hasValidConsultEmailVerification,
    consumeConsultEmailVerification,
} = require("../services/consultEmailVerification.service");

// @desc    Submit a new consultant query / request
// @route   POST /consultant
// @access  Public / Client Authenticated
const createConsultantRequest = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            preferredContactMethod,
            preferredTime,
            topic,
            investmentRange,
            riskTolerance,
            investmentHorizon,
            portfolioSnapshot,
            query,
            emailVerificationToken,
        } = req.body;

        if (!name || !email || !query) {
            return res.status(400).json({
                status: false,
                message: "Name, email, and query message are required.",
            });
        }

        const normalizedEmail = normalizeEmail(email);
        const emailVerified = await hasValidConsultEmailVerification(
            normalizedEmail,
            emailVerificationToken
        );
        if (!emailVerified) {
            return res.status(403).json({
                status: false,
                message: "Verify your email address before submitting a consultation request.",
            });
        }

        let clientId = null;
        let snapshotData = portfolioSnapshot || { deployedCapital: 0, walletBalance: 0, activePortfolios: 0 };

        // If authenticated user
        if (req.user?.sub && mongoose.Types.ObjectId.isValid(req.user.sub)) {
            clientId = req.user.sub;
            // Optionally try to find client to populate profile data if needed
            if (!name || !email) {
                const clientDoc = await Client.findById(clientId);
                if (clientDoc) {
                    name = name || `${clientDoc.firstName} ${clientDoc.lastName}`;
                    email = email || clientDoc.email;
                }
            }
        }

        const newConsultantRequest = await ConsultantRequest.create({
            client: clientId,
            name,
            email: normalizedEmail,
            phone: phone || "",
            preferredContactMethod: preferredContactMethod || "Email",
            preferredTime: preferredTime || "Flexible",
            topic: topic || "General Wealth Advisory",
            investmentRange: investmentRange || "Not Specified",
            riskTolerance: riskTolerance || "Balanced",
            investmentHorizon: investmentHorizon || "Medium Term (1-3 Years)",
            portfolioSnapshot: snapshotData,
            query,
            status: "Pending",
        });

        await consumeConsultEmailVerification(normalizedEmail, emailVerificationToken);

        // Try to send notification email (non-blocking error)
        try {
            const adminEmail = process.env.ADMIN_EMAIL;
            if (adminEmail) {
                await sendNotificationMail({
                    to: adminEmail,
                    subject: `New Wealth Advisory Consultation Request from ${name}`,
                    title: "Consultation Request Received",
                    message: `A client has submitted a new consultation request regarding: ${topic}`,
                    details: [
                        { label: "Client Name", value: name },
                        { label: "Email", value: email },
                        { label: "Phone", value: phone || "Not specified" },
                        { label: "Topic", value: topic },
                        { label: "Investment Range", value: investmentRange || "Not specified" },
                        { label: "Preferred Contact", value: `${preferredContactMethod} (${preferredTime})` },
                        { label: "Query", value: query },
                    ],
                });
            }
        } catch (mailErr) {
            console.error("[CONSULTANT] Failed sending notification mail:", mailErr.message);
        }

        return res.status(201).json({
            status: true,
            message: "Your consultation request has been submitted successfully. A wealth advisor will reach out to you shortly.",
            data: newConsultantRequest,
        });
    } catch (error) {
        console.error("[CONSULTANT] Error creating consultation request:", error);
        return res.status(500).json({
            status: false,
            message: "Failed to submit consultation request. Please try again.",
            error: error.message,
        });
    }
};

// @desc    Get client's own consultation requests
// @route   GET /consultant/my
// @access  Client Authenticated
const getMyConsultantRequests = async (req, res) => {
    try {
        if (!req.user?.sub && !req.user?.email) {
            return res.status(401).json({ status: false, message: "Unauthorized" });
        }

        const filterConditions = [];
        if (req.user.sub && mongoose.Types.ObjectId.isValid(req.user.sub)) {
            filterConditions.push({ client: req.user.sub });
        }
        if (req.user.email && typeof req.user.email === "string") {
            filterConditions.push({ email: req.user.email.toLowerCase() });
        }

        if (filterConditions.length === 0) {
            return res.status(200).json({
                status: true,
                data: [],
            });
        }

        const queryFilter = { $or: filterConditions };

        const requests = await ConsultantRequest.find(queryFilter)
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            status: true,
            data: requests,
        });
    } catch (error) {
        console.error("[CONSULTANT] Error fetching client consultation requests:", error);
        return res.status(500).json({
            status: false,
            message: "Failed to fetch consultation requests.",
            error: error.message,
        });
    }
};

// @desc    Get admin consultation requests list with filtering & pagination
// @route   GET /consultant/admin/list
// @access  Admin / Superadmin
const getAdminConsultantRequests = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const { search, status, topic } = req.query;

        const queryObj = {};

        if (status && status !== "all") {
            queryObj.status = status;
        }

        if (topic && topic !== "all") {
            queryObj.topic = topic;
        }

        if (search) {
            const searchRegex = new RegExp(search, "i");
            queryObj.$or = [
                { name: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                { query: searchRegex },
                { topic: searchRegex },
            ];
        }

        const [requests, totalCount, pendingCount, inReviewCount, resolvedCount] = await Promise.all([
            ConsultantRequest.find(queryObj)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("client", "firstName lastName email phone avatar")
                .lean(),
            ConsultantRequest.countDocuments(queryObj),
            ConsultantRequest.countDocuments({ status: "Pending" }),
            ConsultantRequest.countDocuments({ status: "In Review" }),
            ConsultantRequest.countDocuments({ status: "Resolved" }),
        ]);

        const totalPages = Math.ceil(totalCount / limit) || 1;

        return res.status(200).json({
            status: true,
            data: requests,
            meta: {
                page,
                limit,
                totalCount,
                totalPages,
                pendingCount,
                inReviewCount,
                resolvedCount,
            },
        });
    } catch (error) {
        console.error("[CONSULTANT] Error fetching admin consultation list:", error);
        return res.status(500).json({
            status: false,
            message: "Failed to fetch consultation requests list.",
        });
    }
};

// @desc    Update consultation request status & admin notes and send email to client
// @route   PATCH /consultant/admin/:id
// @access  Admin / Superadmin
const updateConsultantRequest = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ status: false, message: "Invalid consultation request ID." });
        }
        const { status, adminNotes, assignedAdvisor, sendEmail = true } = req.body;

        const existing = await ConsultantRequest.findById(id);
        if (!existing) {
            return res.status(404).json({ status: false, message: "Consultation request not found." });
        }

        if (status) existing.status = status;
        if (adminNotes !== undefined) existing.adminNotes = adminNotes;
        if (assignedAdvisor !== undefined) existing.assignedAdvisor = assignedAdvisor;

        await existing.save();

        let emailSent = false;
        if (existing.email && sendEmail !== false) {
            try {
                const mailerModule = require("../emailTemplate/sendNotificationMail");
                const sendMail = mailerModule.default || mailerModule;

                await sendMail({
                    to: existing.email,
                    subject: `Update on your Wealth Advisory Consultation Request (${existing.topic})`,
                    title: "Wealth Advisory Consultation Update",
                    message: `Dear ${existing.name},\n\nYour consultation request regarding "${existing.topic}" has been reviewed and updated by our Wealth Advisory team. Below are the details regarding your inquiry:`,
                    details: [
                        { label: "Client Name", value: existing.name },
                        { label: "Advisory Topic", value: existing.topic },
                        { label: "Assigned Wealth Specialist", value: existing.assignedAdvisor || "Senior Wealth Specialist" },
                        { label: "Advisory Status", value: existing.status },
                        { label: "Advisor Response & Client Notes", value: existing.adminNotes || "No additional notes provided." },
                    ],
                });
                emailSent = true;
            } catch (mailErr) {
                console.error("[CONSULTANT] Failed sending notification mail to client:", mailErr.message);
            }
        }

        return res.status(200).json({
            status: true,
            message: emailSent
                ? `Response saved and email sent to ${existing.email}.`
                : "Consultation request updated successfully.",
            data: existing,
        });
    } catch (error) {
        console.error("[CONSULTANT] Error updating consultation request:", error);
        return res.status(500).json({
            status: false,
            message: "Failed to update consultation request.",
        });
    }
};

// @desc    Delete consultation request
// @route   DELETE /consultant/admin/:id
// @access  Admin / Superadmin
const deleteConsultantRequest = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ status: false, message: "Invalid consultation request ID." });
        }
        const deleted = await ConsultantRequest.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({ status: false, message: "Consultation request not found." });
        }

        return res.status(200).json({
            status: true,
            message: "Consultation request deleted successfully.",
        });
    } catch (error) {
        console.error("[CONSULTANT] Error deleting consultation request:", error);
        return res.status(500).json({
            status: false,
            message: "Failed to delete consultation request.",
        });
    }
};

module.exports = {
    createConsultantRequest,
    getMyConsultantRequests,
    getAdminConsultantRequests,
    updateConsultantRequest,
    deleteConsultantRequest,
};
