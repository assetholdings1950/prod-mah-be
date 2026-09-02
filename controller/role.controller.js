const { createRoleQuery, getRoleQuery, updateRoleQuery, deleteRolesQuery } = require("../query/role.query")


const createRoleController = async (req, res, next) => {
    try {
        const response = await createRoleQuery(req.body)
        return res.send(response)
    } catch (err) {
        next(err)
    }
}

const getRoleController = async (req, res, next) => {
    try {
        const response = await getRoleQuery()
        return res.send(response)
    } catch (err) {
        next(err)
    }
}


const updateRoleController = async (req, res, next) => {
    try {
        const response = await updateRoleQuery(req.body)
        return res.send(response)
    } catch (err) {
        next(err)
    }
}

const deleteRolesController = async (req, res, next) => {
    try {
        const response = await deleteRolesQuery(req.query.ids)
        return res.send(response)
    } catch (err) {
        next(err)
    }
}

module.exports = {
    createRoleController,
    getRoleController,
    updateRoleController,
    deleteRolesController
}