const { createAdminNotification, humanize } = require("./notificationService");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function startRequestActivityTracking(req, res, context) {
    if (!MUTATING_METHODS.has(req.method) || !["Client", "Agent"].includes(req.user?.model)) return;

    const startedAt = new Date();
    res.once("finish", () => {
        if (context.activityCaptured || res.statusCode >= 400) return;

        const cleanPath = String(req.originalUrl || req.url || "/").split("?")[0];
        const segments = cleanPath.split("/").filter(Boolean);
        const resource = segments.find((segment) => !/^[a-f\d]{24}$/i.test(segment)) || "activity";
        const action = `${resource}.${req.method.toLowerCase()}`;

        void createAdminNotification({
            actorId: req.user.sub,
            actorModel: req.user.model,
            action,
            category: resource.includes("kyc") ? "kyc" : resource.includes("portfolio") ? "portfolio" : resource.includes("deposit") || resource.includes("withdraw") || resource.includes("transaction") ? "finance" : "profile",
            title: `${req.user.model} ${humanize(resource)} Activity`,
            message: `${req.user.model} completed a ${req.method} request on ${humanize(cleanPath)}.`,
            priority: "low",
            actionRequired: false,
            footprints: [
                { label: "Request received", description: `${req.method} ${cleanPath}`, at: startedAt },
                { label: "Request completed", description: `Server responded with ${res.statusCode}`, at: new Date() },
                { label: "Admin notified", description: "Notification stored for administrator review", at: new Date() },
            ],
            source: {
                method: req.method,
                path: cleanPath,
                ip: req.ip || req.socket?.remoteAddress || null,
                userAgent: req.get("user-agent") || null,
            },
            performedBy: { id: req.user.sub, role: req.user.model, name: req.user.email },
        });
    });
}

module.exports = { startRequestActivityTracking };
