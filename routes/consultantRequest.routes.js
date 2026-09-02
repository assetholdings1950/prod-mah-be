const express = require("express");
const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware");
const {
    createConsultantRequest,
    getMyConsultantRequests,
    getAdminConsultantRequests,
    updateConsultantRequest,
    deleteConsultantRequest,
} = require("../controller/consultantRequest.controller");

const router = express.Router();

// Helper middleware for optional auth on POST /
const optionalAuthenticate = (req, res, next) => {
    const auth = req.headers.authorization;
    if (auth || req.cookies?.accessToken) {
        return authenticate(req, res, next);
    }
    next();
};

// ── Client routes ─────────────────────────────────────────────────────────────
router.post("/", optionalAuthenticate, createConsultantRequest);
router.get("/my", authenticate, getMyConsultantRequests);

// ── Admin routes ───────────────────────────────────────────────────────────────
router.get(
    "/admin/list",
    authenticate,
    requireRole(["admin", "superadmin", "agent"]),
    getAdminConsultantRequests
);

router.patch(
    "/admin/:id",
    authenticate,
    requireRole(["admin", "superadmin"]),
    updateConsultantRequest
);

router.delete(
    "/admin/:id",
    authenticate,
    requireRole(["admin", "superadmin"]),
    deleteConsultantRequest
);

module.exports = router;
