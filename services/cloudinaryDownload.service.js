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

const rawAssetCandidatesFromUrl = (url) => {
    const assetUrl = new URL(url);
    const cloudName = process.env.CLOUDIONARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
    const prefix = `/${cloudName}/raw/upload/`;
    const rawPath = decodeURIComponent(assetUrl.pathname.slice(prefix.length)).replace(/^v\d+\//, "");
    const withoutExtension = rawPath.replace(/\.[^.\/]+$/, "");
    return [...new Set([withoutExtension, rawPath])].filter(Boolean);
};

const downloadTrustedCloudinaryUrl = async (url, { maxBytes = 15 * 1024 * 1024 } = {}) => {
    let resource;
    let lastError;
    for (const publicId of rawAssetCandidatesFromUrl(url)) {
        try {
            resource = await cloudinary.api.resource(publicId, { resource_type: "raw", type: "upload" });
            break;
        } catch (error) {
            lastError = error;
        }
    }
    if (!resource) throw lastError || new Error("Cloudinary document was not found");

    const file = await downloadCloudinaryAsset({
        publicId: resource.public_id,
        format: resource.format,
        resourceType: "raw",
    }, { maxBytes });
    return {
        file,
        contentType: "application/octet-stream",
    };
};

const documentFilename = (url, fallback) => {
    try {
        const pathname = new URL(url).pathname;
        const filename = decodeURIComponent(pathname.split("/").pop() || "");
        if (filename && !/[\r\n"\\/]/.test(filename)) return filename;
    } catch {
        // Use the safe fallback below.
    }
    return fallback.replace(/[\r\n"\\/]/g, "-");
};

module.exports = { downloadCloudinaryAsset, downloadTrustedCloudinaryUrl, pdfFilename, documentFilename };
