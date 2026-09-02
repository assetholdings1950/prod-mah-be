const authenticate = require("../middleware/auth.midleware");
const requireRole = require("../middleware/role.middleware")


const adminOnly = [authenticate, requireRole(["admin", "super-admin"])]


module.exports = adminOnly