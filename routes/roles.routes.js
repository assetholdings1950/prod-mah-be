const express = require("express")
const { commonErrors } = require("../errors/error")
const { createRoleController, getRoleController, updateRoleController, deleteRolesController } = require("../controller/role.controller")
const router = express.Router()

router.post('/', createRoleController)

router.get('/', getRoleController)

router.post('/update', updateRoleController)

router.delete('/', deleteRolesController)


router.use(commonErrors)

module.exports = router