const express = require("express")
const { authController, refreshController, logoutController, signUpController, verifyOtpController, resendOtpController, forgotPasswordController, createUserController, getUserController, updateUserController, deleteUserController, resetPasswordByAdminController, submitKycController, approveKycController } = require("../controller/auth.controller")
const { commonErrors } = require("../errors/error")
const authenticate = require("../middleware/auth.midleware")
const router = express.Router()

router.post('/sign-in', authController)

router.post('/sign-up', signUpController)

router.post('/verify-otp', verifyOtpController)

router.post('/resend-otp', resendOtpController)

router.post("/forgot-password", forgotPasswordController)

router.post('/refresh', refreshController)

router.post('/logout', logoutController)

router.post('/create-user', createUserController)

router.get('/get-user', getUserController)

router.post("/update", updateUserController)

router.delete("/delete-users", deleteUserController)

router.post("/reset-password-by-admin", resetPasswordByAdminController)

router.post('/submit-kyc', authenticate, submitKycController)

router.post('/approve-kyc', authenticate, approveKycController)

router.use(commonErrors)

module.exports = router