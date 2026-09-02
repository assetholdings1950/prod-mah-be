const { ValidationError } = require('express-validation');

exports.commonErrors = (error, req, res, next) => {
    try {
        if (error instanceof ValidationError) {
            return res.status(error.statusCode).json(error)
        } else if (error.status_code && error.message) {
            return res.status(error.status_code).json(error)
        } else {
            return res.status(500).json({ status: false, status_code: 500, message: error.message })
        }
    } catch (error) {
        return res.status(500).json({ status: false, status_code: 500, message: "Internal Server Error" })
    }
}