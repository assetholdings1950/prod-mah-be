const { checkAndMarkMaturedPortfoliosService } = require("../services/portfolio.service");

async function processPortfolioMaturity() {
    return checkAndMarkMaturedPortfoliosService();
}

module.exports = { processPortfolioMaturity };
