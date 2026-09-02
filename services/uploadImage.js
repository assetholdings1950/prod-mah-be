import cloudinary from "../utils/cloudinary.js";

export const uploadImage = async (file) => {
    try {
        if (!file || !file.tempFilePath) throw new Error("No file provided");

        // ✅ Upload directly from the temp file path
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
            folder: "news_images",
            resource_type: "image",
        });

        return result.secure_url;
    } catch (err) {
        console.error("Cloudinary Upload Error:", err);
        throw new Error("Image upload failed");
    }
};
