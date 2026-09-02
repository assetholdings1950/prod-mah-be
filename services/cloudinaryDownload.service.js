const axios = require("axios");
const cloudinary = require("../utils/cloudinary");

const downloadCloudinaryAsset = async (asset, { maxBytes = 6 * 1024 * 1024 } = {}) => {
    if (!asset?.publicId) throw new Error("Cloudinary public ID is missing");

    const authenticatedUrl = cloudinary.utils.private_download_url(
        asset.publicId,
        asset.format || "pdf",
        {
            resource_type: asset.resourceType || "image",
            type: "upload",
            expires_at: Math.floor(Date.now() / 1000) + 300,
            attachment: true,
        },
    );
    const response = await axios.get(authenticatedUrl, {
        responseType: "arraybuffer",
        timeout: 20000,
        maxContentLength: maxBytes,
    });
    return Buffer.from(response.data);
};

const pdfFilename = (value, fallback = "resume.pdf") =>
    `${String(value || fallback).replace(/[\r\n"\\/]/g, "-").replace(/\.pdf$/i, "")}.pdf`;

module.exports = { downloadCloudinaryAsset, pdfFilename };
