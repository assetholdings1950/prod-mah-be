const express = require("express");
const { commonErrors } = require("../errors/error");
const authenticate = require("../middleware/auth.midleware");
const { listCountriesController, getCitiesController } = require("../controller/country.controller");

const router = express.Router();

// Country and embedded city lists are public reference data used by onboarding
// and the public careers application form.
router.get("/",        listCountriesController);
router.get("/cities",  authenticate, getCitiesController);

router.use(commonErrors);

module.exports = router;
