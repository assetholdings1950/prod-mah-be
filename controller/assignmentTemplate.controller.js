const {
    createAssignmentTemplateQuery,
    listAssignmentTemplatesQuery,
    getAssignmentTemplateQuery,
    updateAssignmentTemplateQuery,
    deleteAssignmentTemplateQuery,
} = require("../query/assignmentTemplate.query");

const sendResultError = (res, result) =>
    res.status(result.statusCode).json({ success: false, message: result.message });

const createAssignmentTemplateController = async (req, res, next) => {
    try {
        const result = await createAssignmentTemplateQuery(req.body, req.user?.sub);
        if (!result.status) return sendResultError(res, result);
        return res.status(201).json({ success: true, data: result.assignment });
    } catch (error) {
        next(error);
    }
};

const listAssignmentTemplatesController = async (req, res, next) => {
    try {
        const result = await listAssignmentTemplatesQuery(req.query);
        if (!result.status) return sendResultError(res, result);
        return res.status(200).json({
            success: true,
            data: result.assignments,
            pagination: result.pagination,
        });
    } catch (error) {
        next(error);
    }
};

const getAssignmentTemplateController = async (req, res, next) => {
    try {
        const result = await getAssignmentTemplateQuery(req.params.id);
        if (!result.status) return sendResultError(res, result);
        return res.status(200).json({ success: true, data: result.assignment });
    } catch (error) {
        next(error);
    }
};

const updateAssignmentTemplateController = async (req, res, next) => {
    try {
        const result = await updateAssignmentTemplateQuery(
            req.params.id,
            req.body,
            req.user?.sub,
        );
        if (!result.status) return sendResultError(res, result);
        return res.status(200).json({ success: true, data: result.assignment });
    } catch (error) {
        next(error);
    }
};

const deleteAssignmentTemplateController = async (req, res, next) => {
    try {
        const result = await deleteAssignmentTemplateQuery(req.params.id);
        if (!result.status) return sendResultError(res, result);
        return res.status(200).json({
            success: true,
            message: "Assignment deleted successfully",
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createAssignmentTemplateController,
    listAssignmentTemplatesController,
    getAssignmentTemplateController,
    updateAssignmentTemplateController,
    deleteAssignmentTemplateController,
};

