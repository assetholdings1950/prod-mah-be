const {
    createBondQuery,
    listBondsQuery,
    getBondByIdQuery,
    getBondDocumentQuery,
    updateBondQuery,
    deleteBondsQuery,
} = require("../query/bond.query");
const { downloadTrustedCloudinaryUrl, documentFilename } = require("../services/cloudinaryDownload.service");

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

const downloadBondDocumentController = async (req, res, next) => {
    try {
        const result = await getBondDocumentQuery(req.params.id, req.params.documentType);
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
            return res.status(502).json({ status: false, message: "Cloudinary could not provide this bond document." });
        }
        return next(error);
    }
};

const updateBondController = async (req, res, next) => {
    try { return send(res, await updateBondQuery({ ...req.body, updatedBy: req.user.sub })); } catch (error) { return next(error); }
};

const deleteBondsController = async (req, res, next) => {
    try { return send(res, await deleteBondsQuery(req.query.ids)); } catch (error) { return next(error); }
};

module.exports = { createBondController, listBondsController, getBondController, downloadBondDocumentController, updateBondController, deleteBondsController };
