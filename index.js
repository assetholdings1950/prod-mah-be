const http = require("http")
const express = require("express")
const cors = require("cors")
const dotenv = require("dotenv")
const fileUpload = require("express-fileupload")

dotenv.config()

const { app_configuration } = require("./config/app.config")
const connect_mongodb = require("./connections/mongo.connection")
const { authRoutes, roleRoutes, clientRoutes, agentRoutes, investmentPlanRoutes, cloudionaryRoutes, paymentMethodRoutes, depositRoutes, transactionRoutes, withdrawalRoutes, dashboardRoutes, contactRoutes, currencyRoutes, countryRoutes, portfolioRoutes, planChargesRoutes, cronRoutes, activityLogRoutes, accountOpeningFormRoutes, notificationRoutes, reportRoutes, jobRoutes, hiringRoutes, consultantRequestRoutes, consultRoutes, fundTrustReportRoutes, bondRoutes, adminEmailRoutes } = require("./routes")
const schedulePortfolioMaturityChecker = require("./cron/portfolioMaturity")
const { scheduleSipAutoPayment } = require("./cron/sipAutoPayment")
const { scheduleSipReminder } = require("./cron/sipReminder")
const cookieParser = require("cookie-parser")
const { scheduleMasterCrons } = require("./cron/masterCron")

function setupMiddleware(app) {
    dotenv.config()
    app.use(express.json({
        limit: "1024mb",
        verify: (req, _res, buffer) => {
            if (req.originalUrl?.startsWith("/email-center/webhooks/resend")) {
                req.rawBody = buffer.toString("utf8");
            }
        },
    }))
    const allowedOrigins = [
        "https://mah-agent-frontend.vercel.app",
        "https://mah-client-fe.vercel.app",
        "https://mah-admin-fe.vercel.app",
        "https://mah-be.vercel.app",
        "https://agent.merlionassetholdings.com"
    ];
    app.use(cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }
            return callback(new Error("Not allowed by CORS"));
        },
        credentials: true
    }));
    app.use(express.urlencoded({ extended: true }))
    app.use(cookieParser())
    app.use(fileUpload({
        useTempFiles: true,
        tempFileDir: "/tmp/",
    }));

}

function setupRoutes(app) {
    app.use("/auth", authRoutes);
    app.use("/role", roleRoutes);
    app.use("/clients", clientRoutes);
    app.use("/agent", agentRoutes);
    app.use("/investment-plans", investmentPlanRoutes);
    app.use("/cloudionary", cloudionaryRoutes);
    app.use("/payment-methods", paymentMethodRoutes);
    app.use("/deposits", depositRoutes);
    app.use("/transactions", transactionRoutes);
    app.use("/withdrawals", withdrawalRoutes);
    app.use("/dashboard", dashboardRoutes);
    app.use("/contact", contactRoutes);
    app.use("/currency", currencyRoutes);
    app.use("/countries", countryRoutes);
    app.use("/portfolio", portfolioRoutes);
    app.use("/plan-charges", planChargesRoutes);
    app.use("/cron", cronRoutes);
    app.use("/activity-logs", activityLogRoutes);
    app.use("/account-forms", accountOpeningFormRoutes);
    app.use("/notifications", notificationRoutes);
    app.use("/reports", reportRoutes);
    app.use("/jobs", jobRoutes);
    app.use("/hiring", hiringRoutes);
    app.use("/consultant", consultantRequestRoutes);
    app.use("/consult", consultRoutes);
    app.use("/fund-trust-reports", fundTrustReportRoutes);
    app.use("/bonds", bondRoutes);
    app.use("/email-center", adminEmailRoutes);

    app.get("/", (_req, res) => {
        return res.send({
            status: true,
            message: `${app_configuration.APP_NAME} Backend is running`,
            version: '3.0.0.0',
            date: "09th Jan 2026"
        })
    })
}



const app = express()
const server = http.createServer(app)
setupMiddleware(app)
setupRoutes(app)

// On Vercel the app is imported as a serverless function — skip listen().
if (!process.env.VERCEL) {
    connect_mongodb().then(() => {
        server.listen(app_configuration.PORT, () => {
            console.log(`${app_configuration.APP_NAME} Server started at PORT - ${app_configuration.PORT}`)
        })
        scheduleMasterCrons()
    }).catch(() => {
        console.log('could not start the server')
    })
} else {
    // Still connect to MongoDB for serverless invocations
    connect_mongodb().then(() => {
        console.log('MongoDB connected (Vercel serverless)')
    }).catch((err) => {
        console.error('MongoDB connection failed:', err)
    })
}

module.exports = app
