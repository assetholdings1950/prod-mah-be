const cloudinary = require("../utils/cloudinary");

/**
 * Uploads a file (base64 data URL or file path) to Cloudinary.
 * @param {string} fileData - Base64 data URL or file path
 * @param {object} options - Cloudinary upload options
 * @returns {Promise<string>} - The secure URL of the uploaded file
 */
const uploadToCloudinary = async (fileData, options) => {
    try {
        if (!fileData) throw new Error("No file data provided");
        
        let cleanData = fileData;
        if (typeof fileData === "string" && fileData.startsWith("data:")) {
            // Remove codecs parameter from base64 data URL to prevent Cloudinary parser errors
            cleanData = fileData.replace(/;codecs=[^;]+/i, "");
        }

        const result = await cloudinary.uploader.upload(cleanData, {
            overwrite: true,
            invalidate: true,
            ...options
        });
        return result.secure_url;
    } catch (err) {
        console.error("Cloudinary upload error details:", err);
        throw new Error(err.message || "Cloudinary upload failed");
    }
};

/**
 * Streams an in-memory buffer to Cloudinary without creating a temporary file.
 * Returns the identifiers needed to display and later destroy the asset.
 */
const uploadBufferToCloudinary = (buffer, options = {}) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return Promise.reject(new Error("A non-empty upload buffer is required"));
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
            resource_type: "image",
            overwrite: true,
            invalidate: true,
            ...options,
        }, (error, result) => {
            if (error || !result?.secure_url || !result?.public_id) {
                console.error("Cloudinary stream upload error:", error);
                reject(new Error(error?.message || "Cloudinary stream upload failed"));
                return;
            }
            resolve({
                secureUrl: result.secure_url,
                publicId: result.public_id,
                bytes: result.bytes,
                format: result.format,
            });
        });

        stream.on("error", reject);
        stream.end(buffer);
    });
};

module.exports = {
    uploadToCloudinary,
    uploadBufferToCloudinary,
};
