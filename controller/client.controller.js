

const {
    registerClientQuery,
    verifyClientOtpQuery,
    resendClientOtpQuery,
    clientListQuery,
    editClientQuery,
    deleteClientQuery,
    authQuery,
    getClientByIdQuery,
    forgotPasswordClientQuery,
    refreshClientQuery,
    logoutClientQuery,
    submitKycClientQuery,
    approveKycClientQuery,
    rejectKycClientQuery,
    bulkApproveKycQuery,
    bulkRejectKycQuery,
    resetPortfolioValueQuery,
    assignAccountManagerQuery,
} = require("../query/client.query")
const { logActivity } = require("../utils/activityLogger")

const authController = async (req, res, next) => {
    try {
        const response = await authQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};



const registerClientController = async (req, res, next) => {
    try {
        const response = await registerClientQuery(req.body)
        return res.send(response)
    } catch (error) {
        next(error)
    }
}


const verifyClientOtpController = async (req, res, next) => {
    try {
        const response = await verifyClientOtpQuery(req.body)
        return res.send(response)
    } catch (error) {
        next(error)
    }
}


const resendClientOtpController = async (req, res, next) => {
    try {
        const response = await resendClientOtpQuery(req.body)
        return res.send(response)
    } catch (error) {
        next(error)
    }
}


const clientListController = async (req, res, next) => {
    try {
        console.log(req.query)
        const { page, limit, search, status, kycStatus, riskProfile, country, preferredCurrency, agent, accountManager } = req.query

        // An agent hitting this endpoint always sees exactly their own book:
        // clients they referred plus clients an admin assigned them to manage.
        // The query params they send are ignored so the scope cannot be widened.
        const agentScope = req.user && req.user.model === "Agent" ? req.user.sub : undefined;

        const response = await clientListQuery({
            page: Number(page) || 1,
            limit: Number(limit) || 10,
            search: search || "",
            status,
            kycStatus,
            riskProfile,
            country,
            preferredCurrency,
            agent: agentScope ? undefined : agent,
            accountManager: agentScope ? undefined : accountManager,
            agentScope,
        })
        return res.send(response)
    } catch (error) {
        next(error)
    }
}

const editClientController = async (req, res, next) => {
    try {
        const actor = req.user
            ? { sub: req.user.sub, model: req.user.model, role: req.user.role }
            : null;
        const response = await editClientQuery(req.body, actor)
        if (response.status && req.body._id) {
            logActivity({
                userId: req.body._id, userModel: "Client",
                action: "profile.updated", category: "profile",
                description: "Profile updated",
                performedBy: { id: req.user?.sub, role: req.user?.role?.[0] ?? "admin" },
            });
        }
        return res.send(response)
    } catch (error) {
        next(error)
    }
}


const deleteClientController = async (req, res, next) => {
    try {
        const response = await deleteClientQuery(req.query.ids)
        return res.send(response)
    } catch (error) {
        next(error)
    }
}

const getClientByIdController = async (req, res, next) => {
    try {
        const response = await getClientByIdQuery(req.params.id);
        
        // Agents may view clients they referred or clients they support.
        if (response.status && req.user && req.user.model === "Agent") {
            const clientAgentId = response.data.agent?._id || response.data.agent;
            const accountManagerId = response.data.accountManager?._id || response.data.accountManager;
            if (String(clientAgentId) !== String(req.user.sub) && String(accountManagerId) !== String(req.user.sub)) {
                return res.status(403).json({
                    status: false,
                    statusCode: 403,
                    message: "Forbidden - You do not have permission to view this client's profile."
                });
            }
        }

        return res.status(response.statusCode || (response.status ? 200 : 500)).send(response);
    } catch (error) {
        next(error);
    }
};

const assignAccountManagerController = async (req, res, next) => {
    try {
        const response = await assignAccountManagerQuery({
            clientId: req.params.id,
            accountManagerId: req.body.accountManagerId,
            adminId: req.user.sub,
        });
        if (response.status) {
            const manager = response.data?.accountManager;
            const managerName = manager?.fullName || `${manager?.firstName || ""} ${manager?.lastName || ""}`.trim();
            logActivity({
                userId: req.params.id,
                userModel: "Client",
                action: manager ? "account_manager.assigned" : "account_manager.removed",
                category: "profile",
                description: manager ? `Account Manager assigned: ${managerName}` : "Account Manager removed",
                metadata: manager ? { accountManagerId: manager._id, agentId: manager.agentId } : {},
                performedBy: { id: req.user.sub, role: req.user?.role?.[0] || "admin" },
            });
        }
        return res.status(response.statusCode || 200).send(response);
    } catch (error) {
        next(error);
    }
};

const forgotPasswordClientController = async (req, res, next) => {
    try {
        const response = await forgotPasswordClientQuery(req.body);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const refreshClientController = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const response = await refreshClientQuery(refreshToken);
        if (response.status === false) {
            return res.status(response.statusCode || 400).json(response);
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const logoutClientController = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const response = await logoutClientQuery(refreshToken);
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const submitKycClientController = async (req, res, next) => {
    try {
        const response = await submitKycClientQuery(req.user.sub, req.body);
        return res.status(response.statusCode || 200).send(response);
    } catch (error) {
        next(error);
    }
};

const approveKycClientController = async (req, res, next) => {
    try {
        const response = await approveKycClientQuery({ clientId: req.params.id, adminId: req.user.sub });
        if (response.status) {
            logActivity({
                userId: req.params.id, userModel: "Client",
                action: "kyc.approved", category: "kyc",
                description: "KYC approved by admin",
                performedBy: { id: req.user.sub, role: "admin" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const rejectKycClientController = async (req, res, next) => {
    try {
        const response = await rejectKycClientQuery({ clientId: req.params.id, adminId: req.user.sub, remarks: req.body.remarks });
        if (response.status) {
            logActivity({
                userId: req.params.id, userModel: "Client",
                action: "kyc.rejected", category: "kyc",
                description: "KYC rejected by admin",
                metadata: { remarks: req.body.remarks },
                performedBy: { id: req.user.sub, role: "admin" },
            });
        }
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const bulkApproveKycController = async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).send({ status: false, message: "ids array is required." });
        }
        const response = await bulkApproveKycQuery({ ids, adminId: req.user.sub });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const bulkRejectKycController = async (req, res, next) => {
    try {
        const { ids, remarks } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).send({ status: false, message: "ids array is required." });
        }
        const response = await bulkRejectKycQuery({ ids, adminId: req.user.sub, remarks });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

const resetPortfolioValueController = async (req, res, next) => {
    try {
        const { clientId } = req.body;
        if (!clientId) {
            return res.status(400).send({ status: false, message: "clientId is required." });
        }
        const response = await resetPortfolioValueQuery({ clientId });
        return res.send(response);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    registerClientController,
    verifyClientOtpController,
    resendClientOtpController,
    clientListController,
    editClientController,
    deleteClientController,
    authController,
    getClientByIdController,
    forgotPasswordClientController,
    refreshClientController,
    logoutClientController,
    submitKycClientController,
    approveKycClientController,
    rejectKycClientController,
    bulkApproveKycController,
    bulkRejectKycController,
    resetPortfolioValueController,
    assignAccountManagerController,
}
