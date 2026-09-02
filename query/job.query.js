const Job = require('../models/job.model');
const mongoose = require('mongoose');

const extractObjectId = (value) => {
    const normalized = String(value || '');
    if (mongoose.isValidObjectId(normalized)) return normalized;
    return normalized.match(/([a-f\d]{24})$/i)?.[1] || null;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildActiveJobFilter = ({ keyword, location, type } = {}) => {
    const filter = { status: 'Active' };
    const normalizedKeyword = String(keyword || '').trim();
    const normalizedLocation = String(location || '').trim();
    const normalizedType = String(type || '').trim();

    if (normalizedKeyword) {
        const regex = new RegExp(escapeRegex(normalizedKeyword), 'i');
        filter.$or = [{ title: regex }, { description: regex }];
    }
    if (normalizedLocation && normalizedLocation.toLowerCase() !== 'all') {
        filter.location = normalizedLocation;
    }
    if (normalizedType && normalizedType.toLowerCase() !== 'all') {
        filter.type = normalizedType;
    }

    return filter;
};

/**
 * Fetch all active jobs (Public)
 */
const getActiveJobsQuery = async (filters = {}) => {
    try {
        const [jobs, locations, employmentTypes] = await Promise.all([
            Job.find(buildActiveJobFilter(filters)).sort({ createdAt: -1 }),
            Job.distinct('location', { status: 'Active' }),
            Job.distinct('type', { status: 'Active' }),
        ]);
        return {
            status: true,
            statusCode: 200,
            jobs,
            filters: {
                locations: locations.filter(Boolean).sort(),
                employmentTypes: employmentTypes.filter(Boolean).sort(),
            },
        };
    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

const getActiveJobQuery = async (identifier) => {
    try {
        const id = extractObjectId(identifier);
        if (!id) return { status: false, statusCode: 400, message: 'Invalid job ID' };
        const job = await Job.findOne({ _id: id, status: 'Active' });
        if (!job) return { status: false, statusCode: 404, message: 'Job not found' };
        return { status: true, statusCode: 200, job };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

/**
 * Fetch all jobs (Admin)
 */
const getAllJobsQuery = async () => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 });
        return {
            status: true,
            statusCode: 200,
            jobs
        };
    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

/**
 * Create a new job post (Admin)
 */
const createJobQuery = async (jobData) => {
    try {
        const job = new Job(jobData);
        await job.save();
        return {
            status: true,
            statusCode: 201,
            job
        };
    } catch (error) {
        return {
            status: false,
            statusCode: 400,
            message: error.message
        };
    }
};

/**
 * Update an existing job post by ID (Admin)
 */
const updateJobQuery = async (id, updateData) => {
    try {
        if (!id) {
            return {
                status: false,
                statusCode: 400,
                message: "Job ID is required"
            };
        }

        const job = await Job.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
        if (!job) {
            return {
                status: false,
                statusCode: 404,
                message: "Job not found"
            };
        }

        return {
            status: true,
            statusCode: 200,
            job
        };
    } catch (error) {
        return {
            status: false,
            statusCode: 400,
            message: error.message
        };
    }
};

/**
 * Delete a job post by ID (Admin)
 */
const deleteJobQuery = async (id) => {
    try {
        if (!id) {
            return {
                status: false,
                statusCode: 400,
                message: "Job ID is required"
            };
        }

        const job = await Job.findByIdAndDelete(id);
        if (!job) {
            return {
                status: false,
                statusCode: 404,
                message: "Job not found"
            };
        }

        return {
            status: true,
            statusCode: 200,
            message: "Job deleted successfully"
        };
    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

module.exports = {
    getActiveJobsQuery,
    getActiveJobQuery,
    getAllJobsQuery,
    createJobQuery,
    updateJobQuery,
    deleteJobQuery,
    buildActiveJobFilter,
};
