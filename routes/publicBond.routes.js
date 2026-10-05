const express = require("express");
const { commonErrors } = require("../errors/error");
const { listClientBondsController } = require("../controller/clientBond.controller");

const router = express.Router();

// Only active, client-safe bond fields are returned. No authentication is needed
// to browse offerings; investment itself remains protected under /client/bonds.
router.get("/bonds", listClientBondsController);
router.use(commonErrors);

module.exports = router;
