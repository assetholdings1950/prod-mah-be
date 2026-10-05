const {
    listActiveBondsQuery,
    getActiveBondByIdentifierQuery,
    getBondDocumentQuery,
} = require("../query/bond.query");
const { downloadTrustedCloudinaryUrl, documentFilename } = require("../services/cloudinaryDownload.service");
const { createBondInvestmentService, getMyBondInvestmentsService, getMyBondInvestmentByIdService } = require("../services/bondInvestment.service");

const send = (res, response) => res.status(response.statusCode || 200).send(response);

const listClientBondsController = async (req, res, next) => {
    try {
        return send(res, await listActiveBondsQuery({
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 12,
            search: req.query.search || "",
            riskLevel: req.query.riskLevel,
            couponFrequency: req.query.couponFrequency,
            term: req.query.term,
        }));
    } catch (error) { return next(error); }
};

const getClientBondController = async (req, res, next) => {
    try { return send(res, await getActiveBondByIdentifierQuery(req.params.identifier)); } catch (error) { return next(error); }
};

const downloadClientBondDocumentController = async (req, res, next) => {
    try {
        const result = await getBondDocumentQuery(req.params.id, req.params.documentType, { activeOnly: true });
        if (!result.status) return send(res, result);

        const { file, contentType } = await downloadTrustedCloudinaryUrl(result.url);
        const suffix = result.documentType === "term-sheet" ? "term-sheet" : "offering-document";
        const safeName = documentFilename(result.url, `${result.bond.code || "bond"}-${suffix}`);
        res.set("Cache-Control", "private, no-store");
        res.set("Content-Type", contentType);
        res.set("Content-Disposition", `attachment; filename="${safeName}"`);
        return res.status(200).send(file);
    } catch (error) {
        if (error?.response) {
            return res.status(502).json({ status: false, message: "The bond document is temporarily unavailable." });
        }
        return next(error);
    }
};

const investInBondController = async (req, res, next) => {
    try {
        const investment = await createBondInvestmentService({ clientId: req.user.sub, bondId: req.params.id, ...req.body });
        return res.status(201).json({ status: true, message: "Bond investment created successfully.", data: investment });
    } catch (error) {
        const status = error.status || 500;
        return res.status(status).json({ status: false, message: error.message || "Failed to create bond investment." });
    }
};

const getMyBondInvestmentsController = async (req, res, next) => {
    try {
        const result = await getMyBondInvestmentsService({
            clientId: req.user.sub,
            status: req.query.status,
            page: req.query.page,
            limit: req.query.limit,
        });
        return res.status(200).json({ status: true, ...result });
    } catch (error) { return next(error); }
};

const getMyBondInvestmentController = async (req, res, next) => {
    try {
        const investment = await getMyBondInvestmentByIdService({ clientId: req.user.sub, investmentId: req.params.investmentId });
        return res.status(200).json({ status: true, data: investment });
    } catch (error) {
        const status = error.status || 500;
        return res.status(status).json({ status: false, message: error.message || "Failed to fetch bond investment." });
    }
};

module.exports = { listClientBondsController, getClientBondController, downloadClientBondDocumentController, investInBondController, getMyBondInvestmentsController, getMyBondInvestmentController };
