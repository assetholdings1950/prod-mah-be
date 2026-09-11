const mongoose = require("mongoose");
const dns = require("dns");
const { app_configuration } = require("../config/app.config");

const globalCache = globalThis;
globalCache.__mahMongoose ||= { promise: null, dnsConfigured: false };

const configureDns = () => {
    if (globalCache.__mahMongoose.dnsConfigured || !process.env.MONGODB_DNS_SERVERS) return;
    const servers = process.env.MONGODB_DNS_SERVERS
        .split(",")
        .map((server) => server.trim())
        .filter(Boolean);
    if (servers.length) dns.setServers(servers);
    globalCache.__mahMongoose.dnsConfigured = true;
};

const connect_mongodb = async () => {
    if (mongoose.connection.readyState === 1) return mongoose;
    if (!app_configuration.MONGO_DETAILS) {
        throw new Error("MONGO_URL is not configured");
    }

    configureDns();
    if ([0, 3].includes(mongoose.connection.readyState)) {
        globalCache.__mahMongoose.promise = null;
    }
    if (!globalCache.__mahMongoose.promise) {
        console.log("Connecting to database");
        globalCache.__mahMongoose.promise = mongoose.connect(app_configuration.MONGO_DETAILS, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 10000,
        }).then((connection) => {
            console.log("Database connected");
            return connection;
        }).catch((error) => {
            globalCache.__mahMongoose.promise = null;
            throw error;
        });
    }

    return globalCache.__mahMongoose.promise;
};

module.exports = connect_mongodb;
module.exports.configureDns = configureDns;
