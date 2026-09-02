const authRoutes = require("./auth.routes")
const roleRoutes = require("./roles.routes")
const clientRoutes = require("./client.routes")
const agentRoutes = require("./agent.routes")
const investmentPlanRoutes = require("./investmentplans.routes")
const cloudionaryRoutes = require("./cloudionary.routes")
const paymentMethodRoutes = require("./paymentMethod.routes")
const depositRoutes = require("./deposit.routes")
const transactionRoutes = require("./transaction.routes")
const withdrawalRoutes = require("./withdrawalRequest.routes")
const dashboardRoutes = require("./dashboard.routes")
const contactRoutes = require("./contact.routes")
const currencyRoutes = require("./currency.routes")
const countryRoutes = require("./country.routes")
const portfolioRoutes = require("./portfolio.routes")
const planChargesRoutes = require("./planCharges.routes")
const cronRoutes = require("./cron.routes")
const activityLogRoutes = require("./activityLog.routes")
const accountOpeningFormRoutes = require("./accountOpeningForm.routes")
const notificationRoutes = require("./notification.routes")
const reportRoutes = require("./report.routes")
const jobRoutes = require("./job.routes")
const hiringRoutes = require("./hiring.routes")
const consultantRequestRoutes = require("./consultantRequest.routes")
const consultRoutes = require("./consult.routes")
const fundTrustReportRoutes = require("./fundTrustReport.routes")

module.exports = {
    authRoutes,
    roleRoutes,
    clientRoutes,
    agentRoutes,
    investmentPlanRoutes,
    cloudionaryRoutes,
    paymentMethodRoutes,
    depositRoutes,
    transactionRoutes,
    withdrawalRoutes,
    dashboardRoutes,
    contactRoutes,
    currencyRoutes,
    countryRoutes,
    portfolioRoutes,
    planChargesRoutes,
    cronRoutes,
    activityLogRoutes,
    accountOpeningFormRoutes,
    notificationRoutes,
    reportRoutes,
    jobRoutes,
    hiringRoutes,
    consultantRequestRoutes,
    consultRoutes,
    fundTrustReportRoutes,
}
