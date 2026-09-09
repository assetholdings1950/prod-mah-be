const {
    createBondQuery,
    listBondsQuery,
    getBondByIdQuery,
    updateBondQuery,
    deleteBondsQuery,
} = require("../query/bond.query");

const send = (res, response) => res.status(response.statusCode || 200).send(response);

const createBondController = async (req, res, next) => {
    try { return send(res, await createBondQuery({ ...req.body, createdBy: req.user.sub })); } catch (error) { return next(error); }
};

const listBondsController = async (req, res, next) => {
    try {
        return send(res, await listBondsQuery({
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 12,
            search: req.query.search || "",
            status: req.query.status,
            riskLevel: req.query.riskLevel,
            couponFrequency: req.query.couponFrequency,
        }));
    } catch (error) { return next(error); }
};

const getBondController = async (req, res, next) => {
    try { return send(res, await getBondByIdQuery(req.params.id)); } catch (error) { return next(error); }
};

const updateBondController = async (req, res, next) => {
    try { return send(res, await updateBondQuery({ ...req.body, updatedBy: req.user.sub })); } catch (error) { return next(error); }
};

const deleteBondsController = async (req, res, next) => {
    try { return send(res, await deleteBondsQuery(req.query.ids)); } catch (error) { return next(error); }
};

module.exports = { createBondController, listBondsController, getBondController, updateBondController, deleteBondsController };
