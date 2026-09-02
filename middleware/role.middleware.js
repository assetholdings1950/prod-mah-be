

// module.exports = function requireRole(allowed = []) {
//     return (req, res, next) => {
//         if (!req.user) return res.send({
//             status: false,
//             statusCode: 401,
//             message: "not authenticated"
//         });
//         if (!allowed.includes(req.user.role)) return res.send({
//             status: false,
//             statusCode: 403,
//             message: "forbidden - insufficient role"
//         });

//         next();
//     }
// }

module.exports = function requireRole(allowed = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).send({
                status: false,
                statusCode: 401,
                message: "not authenticated",
            });
        }
        const userRoles = Array.isArray(req.user.role)
            ? req.user.role
            : (req.user.role ? [req.user.role] : []);

        const hasRole = userRoles.some(role => {
            if (typeof role === "string") {
                const normalized = role.toLowerCase().replace(/[-_\s]/g, "");
                return allowed.some(allowedRole => allowedRole.toLowerCase().replace(/[-_\s]/g, "") === normalized);
            }
            const name = (role?.roleName || "").toLowerCase().replace(/[-_\s]/g, "");
            const code = (role?.roleCode || "").toLowerCase().replace(/[-_\s]/g, "");
            return allowed.some(allowedRole => {
                const normAllowed = allowedRole.toLowerCase().replace(/[-_\s]/g, "");
                return normAllowed === name || normAllowed === code;
            });
        });


        if (!hasRole) {
            return res.status(403).send({
                status: false,
                statusCode: 403,
                message: "forbidden - insufficient role",
            });
        }

        next();
    };
};
