const { adminDashboardSummaryQuery } = require("../query/dashboard.query");

const adminDashboardSummaryController = async (req, res, next) => {
    try {
        const response = await adminDashboardSummaryQuery();
        return res.status(response.statusCode || 200).send(response);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    adminDashboardSummaryController
};
