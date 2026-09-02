const {
    getActiveJobsQuery,
    getActiveJobQuery,
    getAllJobsQuery,
    createJobQuery,
    updateJobQuery,
    deleteJobQuery
} = require('../query/job.query');

const getActiveJobController = async (req, res, next) => {
    try {
        const result = await getActiveJobQuery(req.params.id);
        if (!result.status) {
            return res.status(result.statusCode).json({ success: false, message: result.message });
        }
        return res.status(200).json({ success: true, data: result.job });
    } catch (error) {
        next(error);
    }
};

/**
 * Get active jobs controller (Public)
 */
const getActiveJobsController = async (req, res, next) => {
    try {
        const result = await getActiveJobsQuery(req.query);
        if (!result.status) {
            return res.status(result.statusCode).json({ success: false, message: result.message });
        }
        return res.status(200).json({
            success: true,
            data: result.jobs,
            filters: result.filters,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all jobs controller (Admin)
 */
const getAllJobsController = async (req, res, next) => {
    try {
        const result = await getAllJobsQuery();
        if (!result.status) {
            return res.status(result.statusCode).json({ success: false, message: result.message });
        }
        return res.status(200).json({ success: true, data: result.jobs });
    } catch (error) {
        next(error);
    }
};

/**
 * Create job controller (Admin)
 */
const createJobController = async (req, res, next) => {
    try {
        const result = await createJobQuery(req.body);
        if (!result.status) {
            return res.status(result.statusCode).json({ success: false, message: result.message });
        }
        return res.status(201).json({ success: true, data: result.job });
    } catch (error) {
        next(error);
    }
};

/**
 * Update job controller (Admin)
 */
const updateJobController = async (req, res, next) => {
    try {
        const id = req.params.id || req.query.id || req.body.id;
        const result = await updateJobQuery(id, req.body);
        if (!result.status) {
            return res.status(result.statusCode).json({ success: false, message: result.message });
        }
        return res.status(200).json({ success: true, data: result.job });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete job controller (Admin)
 */
const deleteJobController = async (req, res, next) => {
    try {
        const id = req.params.id || req.query.id || req.body.id;
        const result = await deleteJobQuery(id);
        if (!result.status) {
            return res.status(result.statusCode).json({ success: false, message: result.message });
        }
        return res.status(200).json({ success: true, message: result.message });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getActiveJobsController,
    getActiveJobController,
    getAllJobsController,
    createJobController,
    updateJobController,
    deleteJobController
};
