const jwt = require("jsonwebtoken");
const { app_configuration } = require("../config/app.config");

const signAccessToken = (payload) => {
    return jwt.sign(payload, app_configuration.JWT_SECRET_KEY, {
        expiresIn: "15m", // short-lived
    });
};

const signRefreshToken = (payload) => {
    return jwt.sign(payload, app_configuration.JWT_REFRESH_KEY, {
        expiresIn: "7d", // long-lived
    });
};

const verifyAccessToken = (token) =>
    jwt.verify(token, app_configuration.JWT_SECRET_KEY);

const verifyRefreshToken = (token) =>
    jwt.verify(token, app_configuration.JWT_REFRESH_KEY);

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
};
