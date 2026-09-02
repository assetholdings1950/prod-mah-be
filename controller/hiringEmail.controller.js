const {
    listHiringEmailLogsQuery,
    retryHiringEmailQuery,
} = require("../query/hiringEmail.query");

const listHiringEmailLogsController = async (req, res, next) => {
    try {
        const result = await listHiringEmailLogsQuery(req.query);
        if (!result.status) {
            return res.status(result.statusCode).json({ success: false, message: result.message });
        }
        return res.status(200).json({
            success: true,
            data: result.logs,
            pagination: result.pagination,
        });
    } catch (error) {
        next(error);
    }
};

const retryHiringEmailController = async (req, res, next) => {
    try {
        const result = await retryHiringEmailQuery(req.params.id);
        if (!result.status) {
            return res.status(result.statusCode).json({ success: false, message: result.message });
        }
        return res.status(200).json({ success: true, message: result.message, data: result.log });
    } catch (error) {
        next(error);
    }
};

module.exports = { listHiringEmailLogsController, retryHiringEmailController };
