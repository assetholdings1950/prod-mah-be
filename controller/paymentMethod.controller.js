const {
    createPaymentMethodQuery,
    paymentMethodListQuery,
    getPaymentMethodByIdQuery,
    activePaymentMethodsQuery,
    editPaymentMethodQuery,
    deletePaymentMethodQuery,
    togglePaymentMethodStatusQuery
} = require("../query/paymentMethod.query");


const createPaymentMethodController = async (req, res, next) => {
    try {
        const response = await createPaymentMethodQuery({
            ...req.body,
            createdBy: req.user?.sub || null
        });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const paymentMethodListController = async (req, res, next) => {
    try {
        const { page, limit, search, type, status } = req.query;
        const response = await paymentMethodListQuery({
            page: Number(page) || 1,
            limit: Number(limit) || 10,
            search: search || "",
            type,
            status
        });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const getPaymentMethodByIdController = async (req, res, next) => {
    try {
        const response = await getPaymentMethodByIdQuery(req.params.id);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const activePaymentMethodsController = async (req, res, next) => {
    try {
        const response = await activePaymentMethodsQuery();
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const editPaymentMethodController = async (req, res, next) => {
    try {
        const response = await editPaymentMethodQuery({
            ...req.body,
            updatedBy: req.user?.sub || null
        });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const deletePaymentMethodController = async (req, res, next) => {
    try {
        console.log(req.query.ids)
        const response = await deletePaymentMethodQuery(req.query.ids);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


const togglePaymentMethodStatusController = async (req, res, next) => {
    try {
        const response = await togglePaymentMethodStatusQuery({
            _id: req.params.id,
            updatedBy: req.user?.sub || null
        });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};


module.exports = {
    createPaymentMethodController,
    paymentMethodListController,
    getPaymentMethodByIdController,
    activePaymentMethodsController,
    editPaymentMethodController,
    deletePaymentMethodController,
    togglePaymentMethodStatusController
};
