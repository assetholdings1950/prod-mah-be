const mongoose = require("mongoose");
const AssignmentTemplate = require("../models/assignmentTemplate.model");

const WRITABLE_FIELDS = [
    "title",
    "role",
    "summary",
    "instructions",
    "allowedResources",
    "estimatedMinutes",
    "questions",
    "resubmissionPolicy",
    "candidateNotes",
    "attachmentNames",
    "status",
];

const pickWritableFields = (payload = {}) =>
    WRITABLE_FIELDS.reduce((result, field) => {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
            result[field] = payload[field];
        }
        return result;
    }, {});

const formatError = (error) => {
    if (error?.name === "ValidationError") {
        return Object.values(error.errors)
            .map((item) => item.message)
            .join(", ");
    }
    return error.message;
};

const createAssignmentTemplateQuery = async (payload, adminId) => {
    try {
        const assignment = await AssignmentTemplate.create({
            ...pickWritableFields(payload),
            createdBy: adminId || null,
            updatedBy: adminId || null,
        });
        return { status: true, statusCode: 201, assignment };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const listAssignmentTemplatesQuery = async ({
    page = 1,
    limit = 20,
    status,
    role,
    search,
} = {}) => {
    try {
        const normalizedPage = Math.max(Number(page) || 1, 1);
        const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
        const filter = {};

        if (status) filter.status = status;
        if (role) filter.role = role;
        if (search) {
            const escapedSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { title: { $regex: escapedSearch, $options: "i" } },
                { role: { $regex: escapedSearch, $options: "i" } },
            ];
        }

        const [assignments, totalDocs] = await Promise.all([
            AssignmentTemplate.find(filter)
                .sort({ updatedAt: -1 })
                .skip((normalizedPage - 1) * normalizedLimit)
                .limit(normalizedLimit)
                .lean(),
            AssignmentTemplate.countDocuments(filter),
        ]);

        return {
            status: true,
            statusCode: 200,
            assignments,
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

const getAssignmentTemplateQuery = async (id) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid assignment ID" };
        }
        const assignment = await AssignmentTemplate.findById(id).lean();
        if (!assignment) {
            return { status: false, statusCode: 404, message: "Assignment not found" };
        }
        return { status: true, statusCode: 200, assignment };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

const updateAssignmentTemplateQuery = async (id, payload, adminId) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid assignment ID" };
        }

        const assignment = await AssignmentTemplate.findById(id);
        if (!assignment) {
            return { status: false, statusCode: 404, message: "Assignment not found" };
        }

        Object.assign(assignment, pickWritableFields(payload), {
            updatedBy: adminId || assignment.updatedBy,
        });
        await assignment.save();

        return { status: true, statusCode: 200, assignment };
    } catch (error) {
        return { status: false, statusCode: 400, message: formatError(error) };
    }
};

const deleteAssignmentTemplateQuery = async (id) => {
    try {
        if (!mongoose.isValidObjectId(id)) {
            return { status: false, statusCode: 400, message: "Invalid assignment ID" };
        }
        const assignment = await AssignmentTemplate.findByIdAndDelete(id);
        if (!assignment) {
            return { status: false, statusCode: 404, message: "Assignment not found" };
        }
        return { status: true, statusCode: 200 };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

module.exports = {
    createAssignmentTemplateQuery,
    listAssignmentTemplatesQuery,
    getAssignmentTemplateQuery,
    updateAssignmentTemplateQuery,
    deleteAssignmentTemplateQuery,
};

