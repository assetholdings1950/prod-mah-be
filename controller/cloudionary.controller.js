// controllers/cloudinary.controller.js
const cloudinary = require("../utils/cloudinary");
const Client = require("../models/client.model");
const Agent = require("../models/agent.model");
const { verifyCandidateAccess } = require("../query/hiring.query");

const generateSignatureForBrandLogo = async (req, res) => {
    try {
        const { uniqueId, folderName } = req.body;

        if (!uniqueId) {
            return res.status(400).json({ error: "uniqueId is required" });
        }

        const timestamp = Math.round(Date.now() / 1000);

        const folder = folderName || "brand_logo";
        const public_id = uniqueId; // ONE IMAGE PER PUBLISHER

        const paramsToSign = {
            timestamp,
            folder,
            public_id,
            overwrite: true,
            invalidate: true,
        };

        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            process.env.CLOUDIONARY_API_SECRET || process.env.CLOUDINARY_API_SECRET
        );

        res.json({
            timestamp,
            folder,
            signature,
            cloudName: process.env.CLOUDIONARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
            public_id,
            apiKey: process.env.CLOUDIONARY_API_KEY || process.env.CLOUDINARY_API_KEY,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to generate signature" });
    }
};

const generateAdminAssetSignature = async (req, res) => {
    try {
        const { uniqueId, main_folder_name: requestedFolder } = req.body;
        const allowedFolders = new Set(["investments-plans", "payment-methods"]);

        if (!uniqueId || !requestedFolder) {
            return res.status(400).json({
                status: false,
                statusCode: 400,
                message: "uniqueId and main_folder_name are required.",
            });
        }

        if (!allowedFolders.has(requestedFolder)) {
            return res.status(400).json({
                status: false,
                statusCode: 400,
                message: "Unsupported admin upload folder.",
            });
        }

        const public_id = String(uniqueId)
            .trim()
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 120);

        if (!public_id) {
            return res.status(400).json({
                status: false,
                statusCode: 400,
                message: "A valid uniqueId is required.",
            });
        }

        const apiSecret = process.env.CLOUDIONARY_API_SECRET || process.env.CLOUDINARY_API_SECRET;
        const cloudName = process.env.CLOUDIONARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDIONARY_API_KEY || process.env.CLOUDINARY_API_KEY;

        if (!apiSecret || !cloudName || !apiKey) {
            return res.status(500).json({
                status: false,
                statusCode: 500,
                message: "Cloudinary is not configured.",
            });
        }

        const timestamp = Math.round(Date.now() / 1000);
        const paramsToSign = {
            timestamp,
            folder: requestedFolder,
            public_id,
            overwrite: true,
            invalidate: true,
        };
        const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

        return res.json({
            status: true,
            statusCode: 200,
            timestamp,
            folder: requestedFolder,
            signature,
            cloudName,
            public_id,
            apiKey,
        });
    } catch (error) {
        console.error("Failed to generate admin asset signature:", error);
        return res.status(500).json({
            status: false,
            statusCode: 500,
            message: "Failed to generate admin upload signature.",
        });
    }
};


const generateSignatureForSubFolder = async (req, res) => {
    try {
        const { assetType } = req.body;
        const assetConfig = {
            selfie: { suffix: "selfie", resourceType: "image", folder: "kyc", unique: false },
            id_front: { suffix: "id_front", resourceType: "image", folder: "kyc", unique: false },
            id_back: { suffix: "id_back", resourceType: "image", folder: "kyc", unique: false },
            declaration_video: { suffix: "declaration_video", resourceType: "video", folder: "kyc", unique: false },
            deposit_proof: { suffix: "deposit-proof", resourceType: "image", folder: "deposits", unique: true },
            profile_image: { suffix: "avatar", resourceType: "image", folder: "profile", unique: false },
        }[assetType];

        if (!assetConfig) {
            return res.status(400).json({ error: "Invalid KYC asset type." });
        }

        // Support both clients and agents. The auth middleware sets req.user.model
        // from the JWT role, so the same endpoint can serve either app.
        const isAgent = req.user?.model === "Agent";
        const Model = isAgent ? Agent : Client;
        const rootFolder = isAgent ? "agents" : "clients";
        const fallbackName = isAgent ? "agent" : "client";

        const owner = await Model.findById(req.user.sub, "firstName lastName fullName").lean();
        if (!owner) {
            return res.status(404).json({ error: `${isAgent ? "Agent" : "Client"} not found.` });
        }

        const displayName = [owner.firstName, owner.lastName].filter(Boolean).join(" ")
            || owner.fullName
            || fallbackName;
        const ownerFolderName = displayName
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            || fallbackName;

        const timestamp = Math.round(Date.now() / 1000);
        const folder = `${rootFolder}/${ownerFolderName}/${assetConfig.folder}`;
        // Stable public IDs ensure a rejected client's resubmission overwrites
        // the previous asset instead of creating another set of KYC files.
        const public_id = assetConfig.unique
            ? `${assetConfig.suffix}-${timestamp}-${Math.random().toString(36).slice(2, 10)}`
            : assetConfig.suffix;

        const paramsToSign = {
            timestamp,
            folder,
            public_id,
            overwrite: true,
            invalidate: true,
        };

        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            process.env.CLOUDIONARY_API_SECRET || process.env.CLOUDINARY_API_SECRET
        );

        res.json({
            timestamp,
            folder,
            signature,
            cloudName: process.env.CLOUDIONARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
            public_id,
            apiKey: process.env.CLOUDIONARY_API_KEY || process.env.CLOUDINARY_API_KEY,
            resourceType: assetConfig.resourceType,
        });

    } catch (error) {
        console.error({ error });
        res.status(500).json({ error: "Failed to generate signature" });
    }
};

const generateHiringSignature = async (req, res) => {
    try {
        const { assetType, candidateName, mimeType, fileExtension, reference, token, access } = req.body;
        const normalizedExtension = String(fileExtension || "")
            .toLowerCase()
            .replace(/^\./, "");
        const normalizedMimeType = String(mimeType || "")
            .toLowerCase()
            .split(";")[0]
            .trim();
        const isPdfResume =
            assetType === "resume" &&
            normalizedMimeType === "application/pdf" &&
            normalizedExtension === "pdf";
        const isOfficeResume =
            assetType === "resume" &&
            ["doc", "docx"].includes(normalizedExtension);
        const isIntroductionVideo =
            assetType === "introduction_video" &&
            ["video/mp4", "video/quicktime", "video/webm"].includes(normalizedMimeType) &&
            ["mp4", "mov", "webm"].includes(normalizedExtension);
        const isAssessmentAttachment =
            assetType === "assessment_attachment" &&
            ["pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "zip"].includes(normalizedExtension);

        if (isAssessmentAttachment && !(await verifyCandidateAccess(reference, token, access))) {
            return res.status(401).json({ error: "Invalid application access." });
        }

        const assetConfig = isIntroductionVideo
            ? {
                suffix: "introduction-video",
                resourceType: "video",
                transformation: "c_limit,w_1280,h_720,q_auto:good,vc_auto",
            }
            : isPdfResume
                ? { suffix: "resume", resourceType: "image" }
                : isOfficeResume
                    ? {
                        suffix: "resume",
                        resourceType: "raw",
                        rawExtension: normalizedExtension,
                    }
                    : isAssessmentAttachment
                        ? {
                            suffix: "assessment-attachment",
                            resourceType: normalizedExtension === "pdf" ? "image" : "raw",
                            rawExtension: normalizedExtension === "pdf" ? undefined : normalizedExtension,
                            subfolder: "assessments",
                        }
                    : null;

        if (!assetConfig) {
            return res.status(400).json({ error: "Invalid hiring file type." });
        }

        const candidateFolderName = String(candidateName || "")
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80);

        if (!candidateFolderName) {
            return res.status(400).json({ error: "Candidate name is required." });
        }

        const timestamp = Math.round(Date.now() / 1000);
        const folder = `hiring/${candidateFolderName}${assetConfig.subfolder ? `/${assetConfig.subfolder}` : ""}`;
        const publicIdBase = `${assetConfig.suffix}-${timestamp}-${Math.random().toString(36).slice(2, 10)}`;
        const public_id = assetConfig.rawExtension
            ? `${publicIdBase}.${assetConfig.rawExtension}`
            : publicIdBase;
        const paramsToSign = {
            timestamp,
            folder,
            public_id,
            overwrite: false,
            invalidate: true,
            ...(assetConfig.transformation
                ? { transformation: assetConfig.transformation }
                : {}),
        };

        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            process.env.CLOUDIONARY_API_SECRET || process.env.CLOUDINARY_API_SECRET
        );

        return res.json({
            timestamp,
            folder,
            signature,
            cloudName: process.env.CLOUDIONARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
            public_id,
            apiKey: process.env.CLOUDIONARY_API_KEY || process.env.CLOUDINARY_API_KEY,
            resourceType: assetConfig.resourceType,
            transformation: assetConfig.transformation,
        });
    } catch (error) {
        console.error({ error });
        return res.status(500).json({ error: "Failed to generate hiring upload signature." });
    }
};

module.exports = {
    generateSignatureForBrandLogo,
    generateAdminAssetSignature,
    generateSignatureForSubFolder,
    generateHiringSignature,
};
