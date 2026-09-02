const mongoose = require("mongoose");
const HiringEmailLog = require("../models/hiringEmailLog.model");
const HiringApplication = require("../models/hiringApplication.model");
const { sendHiringEmail } = require("../services/hiringEmail.service");

const listHiringEmailLogsQuery = async ({
    page = 1,
    limit = 20,
    status,
    type,
    applicationReference,
} = {}) => {
    try {
        const normalizedPage = Math.max(Number(page) || 1, 1);
        const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
        const filter = {};
        if (status) filter.status = status;
        if (type) filter.type = type;
        if (applicationReference) filter.applicationReference = String(applicationReference).toUpperCase();

        const [logs, totalDocs] = await Promise.all([
            HiringEmailLog.find(filter)
                .sort({ createdAt: -1 })
                .skip((normalizedPage - 1) * normalizedLimit)
                .limit(normalizedLimit)
                .lean(),
            HiringEmailLog.countDocuments(filter),
        ]);
        return {
            status: true,
            statusCode: 200,
            logs,
            pagination: {
                page: normalizedPage,
                limit: normalizedLimit,
                totalDocs,
                totalPages: Math.ceil(totalDocs / normalizedLimit),
            },
        };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const retryHiringEmailQuery = async (id) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid email log ID" };
        }
        const log = await HiringEmailLog.findById(id);
        if (!log) return { status: false, statusCode: 404, message: "Hiring email log not found" };
        if (log.status === "sent") {
            return { status: false, statusCode: 409, message: "This email has already been sent" };
        }
        if (log.status === "pending") {
            return { status: false, statusCode: 409, message: "This email is already pending" };
        }
        if (["candidate_tracking_access", "candidate_tracking_otp"].includes(log.type)) {
            return {
                status: false,
                statusCode: 409,
                message: "Ask the candidate to request a new verification OTP",
            };
        }
        const application = await HiringApplication.findById(log.application);
        if (!application) {
            return { status: false, statusCode: 404, message: "Application not found" };
        }
        const result = await sendHiringEmail({
            eventKey: log.eventKey,
            type: log.type,
            application,
            context: log.context || {},
        });
        const updatedLog = await HiringEmailLog.findById(id).lean();
        return {
            status: result.status,
            statusCode: result.status ? 200 : 502,
            message: result.status ? "Hiring email sent successfully" : result.message,
            log: updatedLog,
        };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

module.exports = { listHiringEmailLogsQuery, retryHiringEmailQuery };
