const express = require("express");
const { commonErrors } = require("../errors/error");
const { convertCurrencyController } = require("../controller/currency.controller");

const router = express.Router();

router.get("/convert", convertCurrencyController);

router.use(commonErrors);

module.exports = router;
