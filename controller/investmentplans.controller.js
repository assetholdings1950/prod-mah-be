const {
    createInvestmentPlanQuery,
    investmentPlanListQuery,
    getInvestmentPlanByIdQuery,
    editInvestmentPlanQuery,
    deleteInvestmentPlanQuery
} = require("../query/investmentplans.query");


const createInvestmentPlanController = async (req, res, next) => {
    try {
        const response = await createInvestmentPlanQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const investmentPlanListController = async (req, res, next) => {
    try {
        const { page, limit, search, category, status, riskLevel, featured } = req.query;

        const response = await investmentPlanListQuery({
            page: Number(page) || 1,
            limit: Number(limit) || 10,
            search: search || "",
            category,
            status,
            riskLevel,
            featured
        });

        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const getInvestmentPlanByIdController = async (req, res, next) => {
    try {
        const response = await getInvestmentPlanByIdQuery(req.params.id);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const editInvestmentPlanController = async (req, res, next) => {
    try {
        const response = await editInvestmentPlanQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const deleteInvestmentPlanController = async (req, res, next) => {
    try {
        const response = await deleteInvestmentPlanQuery(req.query.ids);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


module.exports = {
    createInvestmentPlanController,
    investmentPlanListController,
    getInvestmentPlanByIdController,
    editInvestmentPlanController,
    deleteInvestmentPlanController
};