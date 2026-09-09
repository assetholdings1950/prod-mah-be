const dotenv = require("dotenv");

dotenv.config();

exports.app_configuration = {
    PORT: process.env.PORT,
    APP_NAME: process.env.APP_NAME,
    MONGO_DETAILS: process.env.MONGO_URL,
    JWT_SECRET_KEY: process.env.JWT_SECRET,
    JWT_EXPIRESIN: process.env.JWT_EXPIRESIN,
    JWT_REFRESH_KEY: process.env.JWT_REFRESH_SECRET,
};
