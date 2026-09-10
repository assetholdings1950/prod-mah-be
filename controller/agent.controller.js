const agentModel = require("../models/agent.model");
const {
    authQuery,
    signUpQuery,
    createAgentByAdminQuery,
    createReferralAgentByAgentQuery,
    getReferredAgentsQuery,
    verifyOtpQuery,
    resendOtpQuery,
    forgotPasswordQuery,
    submitKycQuery,
    approveKycQuery,
    agentListQuery,
    editAgentQuery,
    deleteAgentQuery,
    getAgentByIdQuery,
    updateAgentProfileQuery
} = require("../query/agent.query");
const { verifyRefreshToken, signAccessToken } = require("../services/jwt.service");
const { logActivity } = require("../utils/activityLogger");

const authController = async (req, res, next) => {
    try {
        const response = await authQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const signUpController = async (req, res, next) => {
    try {
        const response = await signUpQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const createAgentByAdminController = async (req, res, next) => {
    try {
        const response = await createAgentByAdminQuery({
            ...req.body,
            createdBy: req.user.sub
        });

        if (response.status && response.agent?._id) {
            const currentRole = Array.isArray(req.user.role) ? req.user.role[0] : req.user.role;
            const roleName = typeof currentRole === "string"
                ? currentRole
                : currentRole?.roleName || currentRole?.roleCode || "admin";

            logActivity({
                userId: response.agent._id,
                userModel: "Agent",
                action: "account.created",
                category: "account",
                description: "Agent account created from the admin panel",
                performedBy: { id: req.user.sub, role: roleName },
                metadata: { agentId: response.agent.agentId }
            });
        }

        return res.status(response.statusCode || 500).send(response);
    } catch (error) {
        next(error);
    }
};

/** An authenticated agent creates a downline agent under their own referral. */
const createReferralAgentByAgentController = async (req, res, next) => {
    try {
        const referrerAgentId = req.user.sub;
        const response = await createReferralAgentByAgentQuery(req.body, referrerAgentId);

        if (response.status && response.agent?._id) {
            logActivity({
                userId: response.agent._id,
                userModel: "Agent",
                action: "account.created",
                category: "account",
                description: "Agent account created via agent referral",
                performedBy: { id: referrerAgentId, role: "Agent" },
                metadata: { agentId: response.agent.agentId, sponsorAgent: referrerAgentId }
            });
        }

        return res.status(response.statusCode || 500).send(response);
    } catch (error) {
        next(error);
    }
};

/** List the agents the authenticated agent has personally referred. */
const getMyReferredAgentsController = async (req, res, next) => {
    try {
        const { page, limit, search } = req.query;
        const response = await getReferredAgentsQuery(req.user.sub, {
            page: Number(page) || 1,
            limit: Number(limit) || 20,
            search: search || ""
        });
        return res.status(response.statusCode || 500).send(response);
    } catch (error) {
        next(error);
    }
};

const verifyOtpController = async (req, res, next) => {
    try {
        const response = await verifyOtpQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const resendOtpController = async (req, res, next) => {
    try {
        const response = await resendOtpQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const forgotPasswordController = async (req, res, next) => {
    try {
        const response = await forgotPasswordQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const refreshController = async (req, res, next) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({ status: false, message: "Refresh token required" });
    }

    try {
        const payload = verifyRefreshToken(refreshToken);
        const agent = await agentModel.findById(payload.sub);

        if (!agent || agent.refreshToken !== refreshToken) {
            return res.status(403).json({ status: false, message: "Invalid refresh token" });
        }

        const newAccessToken = signAccessToken({
            sub: agent._id,
            role: ["Agent"],
            email: agent.email,
        });

        return res.json({
            status: true,
            accessToken: newAccessToken,
        });
    } catch (err) {
        return res.status(403).json({ status: false, message: "Invalid or expired refresh token" });
    }
};

const logoutController = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ status: false, message: "Refresh token required" });
    }

    const agent = await agentModel.findOne({ refreshToken });
    if (!agent) {
        return res.status(200).json({ status: true, message: "Logged out" });
    }

    agent.refreshToken = null;
    await agent.save();

    return res.json({ status: true, message: "Logged out successfully" });
};

const submitKycController = async (req, res, next) => {
    try {
        const userId = req.user.sub;
        const response = await submitKycQuery(userId, req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const approveKycController = async (req, res, next) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).send({
                status: false,
                statusCode: 400,
                message: "Agent userId is required for KYC approval."
            });
        }
        const response = await approveKycQuery(userId);
        if (response.status) {
            logActivity({
                userId, userModel: "Agent",
                action: "kyc.approved", category: "kyc",
                description: "KYC approved by admin",
                performedBy: { id: req.user?.sub, role: "admin" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const agentListController = async (req, res, next) => {
    try {
        const { page, limit, search, status, kycStatus, agentLevel, country, preferredCurrency } = req.query;
        const response = await agentListQuery({
            page: Number(page) || 1,
            limit: Number(limit) || 10,
            search: search || "",
            status,
            kycStatus,
            agentLevel,
            country,
            preferredCurrency
        });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const editAgentController = async (req, res, next) => {
    try {
        const response = await editAgentQuery(req.body);
        if (response.status && req.body._id) {
            logActivity({
                userId: req.body._id, userModel: "Agent",
                action: "profile.updated", category: "profile",
                description: "Profile updated",
                performedBy: { id: req.user?.sub, role: req.user?.role?.[0] ?? "admin" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const deleteAgentController = async (req, res, next) => {
    try {
        const response = await deleteAgentQuery(req.query.ids);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const getAgentByIdController = async (req, res, next) => {
    try {
        const response = await getAgentByIdQuery(req.params.id);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const getAgentProfileController = async (req, res, next) => {
    try {
        const response = await getAgentByIdQuery(req.user.sub);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const updateAgentProfileController = async (req, res, next) => {
    try {
        const agentId = req.user.sub;
        const response = await updateAgentProfileQuery(agentId, req.body);
        if (response.status) {
            logActivity({
                userId: agentId, userModel: "Agent",
                action: "profile.self_updated", category: "profile",
                description: "Agent updated their own profile",
                performedBy: { id: agentId, role: "Agent" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    authController,
    signUpController,
    createAgentByAdminController,
    createReferralAgentByAgentController,
    getMyReferredAgentsController,
    verifyOtpController,
    resendOtpController,
    forgotPasswordController,
    refreshController,
    logoutController,
    submitKycController,
    approveKycController,
    agentListController,
    editAgentController,
    deleteAgentController,
    getAgentByIdController,
    getAgentProfileController,
    updateAgentProfileController
};
