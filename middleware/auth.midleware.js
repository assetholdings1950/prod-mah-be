const asyncHandler = require("express-async-handler");
const { verifyAccessToken } = require("../services/jwt.service");
const { runInRequestContext } = require("../utils/requestContext");
const { startRequestActivityTracking } = require("../utils/requestActivityTracker");

const authenticate = asyncHandler(async (req, res, next) => {
  const auth = req.headers.authorization;
  let token = null;

  console.log("[backend auth.middleware] Headers Authorization:", auth ? auth.substring(0, 25) + "..." : "undefined");
  console.log("[backend auth.middleware] Cookies:", req.cookies);

  if (auth && auth.startsWith("Bearer ")) {
    token = auth.split(" ")[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    console.log("[backend auth.middleware] No token found!");
    return res
      .status(401)
      .json({ status: false, message: "Authorization required" });
  }
  try {
    const payload = verifyAccessToken(token);

    // Derive the owning collection ("model") from the JWT role so downstream
    // controllers (e.g. withdrawals/deposits) attribute records to the right
    // user type. Agent tokens carry role ["Agent"]; client/user tokens differ.
    const roles = Array.isArray(payload.role)
      ? payload.role
      : (payload.role ? [payload.role] : []);
    const roleStrings = roles.map((r) => (typeof r === "string" ? r : (r?.roleName || r?.roleCode || ""))).filter(Boolean);
    let model = "User";
    if (roleStrings.some((r) => /^agent$/i.test(r))) {
      model = "Agent";
    } else if (roleStrings.some((r) => /^client$/i.test(r))) {
      model = "Client";
    }

    req.user = { sub: payload.sub, email: payload.email, role: payload.role, model };
    const context = { req, activityCaptured: false };
    runInRequestContext(context, () => {
      startRequestActivityTracking(req, res, context);
      next();
    });
  } catch (error) {
    return res
      .status(401)
      .json({ status: false, message: "Invalid or expired token" });
  }
});

module.exports = authenticate;
