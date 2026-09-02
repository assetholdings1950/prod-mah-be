const userModel = require("../models/user.model");
const { signAccessToken, signRefreshToken } = require("../services/jwt.service");
const bcrypt = require("bcryptjs");
const { default: sendOtpMail, sendGenericMail } = require("../emailTemplate/sendOtpMail");
const { default: sendWelcomeMail } = require("../emailTemplate/sendWelcomeMail");
const { passwordChangedTemplate } = require("../services/emailTemplates");
const otpVerificationModel = require("../models/otpVerification.model");
const { sendUserWelcomeMail } = require("../services/gmailServices");
const crypto = require("crypto");
const { default: sendNotificationMail } = require("../emailTemplate/sendNotificationMail");


const authQuery = async (details) => {
    const { email, password } = details;

    if (!email || !password) {
        return { status: false, statusCode: 400, message: "email and password is required" };
    }

    const user = await userModel.findOne({ email }).populate({
        path: "role", select: "roleName contents roleCode"
    });

    if (!user) {
        return { status: false, statusCode: 401, message: "invalid email" };
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
        return { status: false, statusCode: 401, message: "invalid password" };
    }

    const accessToken = signAccessToken({ sub: user._id, role: user.role, email: user.email });
    const refreshToken = signRefreshToken({ sub: user._id });

    user.refreshToken = refreshToken;
    await user.save();

    return {
        status: true,
        statusCode: 200,
        message: "Logged in. Welcome!",
        accessToken,
        refreshToken,
        user
    };
};


const signUpQuery = async (details) => {
    try {
        const { firstName, lastName, email, password, referralCode } = details;

        const existingUser = await userModel.findOne({ email });

        if (existingUser && existingUser.isVerified) {
            return {
                status: false,
                statusCode: 400,
                message: "Email already registered and verified. Try logging in."
            };
        }

        // Fetch OTP entry if exists
        const existingOtp = await otpVerificationModel.findOne({ email });

        if (existingUser && !existingUser.isVerified) {

            // If OTP exists for this user
            if (existingOtp) {
                const otpExpired = existingOtp.otpExpires < Date.now();

                // OTP expired → delete user + OTP → recreate
                if (otpExpired) {
                    await userModel.deleteOne({ email });
                    await otpVerificationModel.deleteOne({ email });

                    // Continue to CREATE new user & OTP below
                } else {
                    return {
                        status: true,
                        statusCode: 200,
                        message: "Try again after 5 min."
                    };
                }
            } else {
                // OTP does not exist but user is not verified → delete user to recreate cleanly
                await userModel.deleteOne({ email });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

        // Create fresh user
        const newUser = await userModel.create({
            firstName,
            lastName,
            email,
            passwordHash: hashedPassword,
            isVerified: false,
            referralCode: referralCode || null
        });

        // Create fresh OTP entry
        await otpVerificationModel.create({
            email,
            otpCode: otp,
            otpExpires: Date.now() + 5 * 60 * 1000
        });

        await sendOtpMail(
            newUser.email,
            otp,
            "Your Registration OTP for Verification"
        );

        // Send notification to Admin
        try {
            const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
            await sendNotificationMail({
                to: adminEmail,
                subject: `New User Signup Initiated: ${newUser.firstName || ""} ${newUser.lastName || ""}`,
                title: "User Signup Initiated",
                message: `A new user has initiated registration on Merlion Asset Holdings and is pending email verification.`,
                details: [
                    { label: "Name", value: `${newUser.firstName || ""} ${newUser.lastName || ""}` },
                    { label: "Email", value: newUser.email },
                    { label: "Status", value: "Pending OTP Verification" }
                ]
            });
        } catch (adminEmailError) {
            console.error("Failed to send admin notification for user signup:", adminEmailError);
        }

        return {
            status: true,
            statusCode: 200,
            message: "User registered successfully. OTP sent to your email.",
            newUser
        };

    } catch (error) {
        if (error.code === 11000) {
            return {
                status: false,
                statusCode: 400,
                message: "Email is already registered. Try logging in."
            };
        }
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

const verifyOtpQuery = async (details) => {
    try {
        const { email, otp } = details;

        // 1. Check user exists
        const user = await userModel.findOne({ email });
        if (!user) {
            return {
                status: false,
                statusCode: 400,
                message: "User not found. Please register first."
            };
        }

        // 2. Fetch OTP entry
        const otpEntry = await otpVerificationModel.findOne({ email });
        if (!otpEntry) {
            return {
                status: false,
                statusCode: 400,
                message: "OTP not found. Please request a new OTP."
            };
        }


        // 3. Check OTP expiry
        if (otpEntry.otpExpires < Date.now()) {
            await otpVerificationModel.deleteOne({ email }); // delete expired OTP
            return {
                status: false,
                statusCode: 400,
                message: "OTP expired. Please resend OTP."
            };
        }

        // 4. Check OTP code
        if (otpEntry.otpCode !== otp) {
            return {
                status: false,
                statusCode: 400,
                message: "Invalid OTP."
            };
        }

        // 5. OTP verified → Update user + delete OTP record
        await userModel.updateOne(
            { email },
            {
                $set: {
                    isVerified: true,
                    verificationTime: new Date()
                }
            }
        );

        // Remove OTP from OTP collection
        await otpVerificationModel.deleteOne({ email });

        await sendWelcomeMail(email, "Action Required: Complete Your Merlion Asset Holdings KYC Verification");

        // Send notification to Admin
        try {
            const verifiedUser = await userModel.findOne({ email });
            if (verifiedUser) {
                const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
                await sendNotificationMail({
                    to: adminEmail,
                    subject: `New User Registered: ${verifiedUser.firstName || ""} ${verifiedUser.lastName || ""}`,
                    title: "New User Registration",
                    message: "A new user has successfully registered and verified their email address on Merlion Asset Holdings.",
                    details: [
                        { label: "Name", value: verifiedUser.fullName || `${verifiedUser.firstName || ""} ${verifiedUser.lastName || ""}` },
                        { label: "Email", value: verifiedUser.email },
                        { label: "Registered At", value: new Date(verifiedUser.createdAt).toLocaleString() }
                    ]
                });
            }
        } catch (adminEmailError) {
            console.error("Failed to send admin notification for user verification:", adminEmailError);
        }

        return {
            status: true,
            statusCode: 200,
            message: "Email verified successfully."
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

const resendOtpQuery = async (details) => {
    try {
        const { email } = details;

        const existingUser = await userModel.findOne({ email });

        // User does not exist
        if (!existingUser) {
            return {
                status: false,
                statusCode: 404,
                message: "User not found. Please register first."
            };
        }



        // Check if OTP record exists for the user
        const existingOtp = await otpVerificationModel.findOne({ email });

        // Case 1: OTP exists
        if (existingOtp) {

            // Check if OTP is expired
            if (existingOtp.otpExpires < Date.now()) {
                const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

                existingOtp.otpCode = newOtp;
                existingOtp.otpExpires = Date.now() + 5 * 60 * 1000;
                await existingOtp.save();

                await sendOtpMail(
                    email,
                    newOtp,
                    "Your OTP for Verification"
                );

                return {
                    status: true,
                    statusCode: 200,
                    message: "New OTP has been sent to your email."
                };
            }

            // OTP exists & still valid
            return {
                status: false,
                statusCode: 400,
                message: "Your previous OTP is still valid. Please use that."
            };
        }

        // Case 2: No OTP exists in DB → Create a new OTP
        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

        await otpVerificationModel.create({
            email,
            otpCode: newOtp,
            otpExpires: Date.now() + 5 * 60 * 1000
        });

        await sendOtpMail(
            email,
            newOtp,
            "Your OTP for Verification"
        );

        return {
            status: true,
            statusCode: 200,
            message: "OTP has been sent to your email."
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};



const forgotPasswordQuery = async (details) => {
    try {
        const { email, password } = details;

        const existingUser = await userModel.findOne({ email });

        if (!existingUser) {
            return {
                status: false,
                statusCode: 400,
                message: "User not found. please register first"
            };
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await userModel.updateOne(
            { email },
            {
                $set: {
                    passwordHash: hashedPassword,
                }
            }
        );

        await sendGenericMail(
            email,
            "Password change Notification",
            passwordChangedTemplate()
        );

        return {
            status: true,
            statusCode: 200,
            message: "Password changed Successfully"
        }

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        }
    }
}


const createUserQuery = async (details) => {
    try {
        const { email } = details;

        const existingUser = await userModel.findOne({ email });

        if (existingUser) {
            return {
                status: false,
                statusCode: 400,
                message: "Email already registered. Try logging in."
            };
        }

        const generatePassword = (length = 8) => {
            return crypto
                .randomBytes(length)
                .toString("base64")
                .slice(0, length);
        };

        const plainPassword = generatePassword(8);
        console.log({ plainPassword })
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Create fresh user
        const newUser = await userModel.create({
            ...details,
            passwordHash: hashedPassword,
            createdBy: details.actionTakenBy
        });

        await sendUserWelcomeMail({ ...details, plainPassword })

        // Send email to Super-Admin
        try {
            const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
            const populatedNewUser = await userModel.findById(newUser._id).populate("role");
            const roleNames = (populatedNewUser.role || []).map(r => r.roleName).join(", ") || "No Roles Assigned";

            let creatorName = "Admin";
            if (details.actionTakenBy) {
                const creator = await userModel.findById(details.actionTakenBy);
                if (creator) {
                    creatorName = `${creator.firstName || ""} ${creator.lastName || ""}`.trim() || creator.fullName || "Admin";
                }
            }

            await sendNotificationMail({
                to: adminEmail,
                subject: "New Staff Account Created | Merlion Asset Holdings",
                title: "New Staff Account Created",
                message: `A new administrative staff account has been created on the system by ${creatorName}.`,
                details: [
                    { label: "Staff Name", value: `${newUser.firstName || ""} ${newUser.lastName || ""}`.trim() || newUser.fullName || "Staff" },
                    { label: "Staff Email", value: newUser.email },
                    { label: "Assigned Roles", value: roleNames },
                    { label: "Created By", value: creatorName },
                    { label: "Creation Time", value: new Date(newUser.createdAt).toLocaleString() }
                ]
            });
        } catch (mailError) {
            console.error("Failed to send new staff creation email to super-admin:", mailError);
        }

        return {
            status: true,
            statusCode: 200,
            message: "User registered successfully.",
            newUser
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
}


const getUserQuery = async ({ page, limit, search, isUserActive, roles }) => {
    try {

        const query = {}

        if (search && search.trim() !== "") {
            query.$or = [
                { fullName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { country: { $regex: search, $options: "i" } }
            ]
        }

        if (isUserActive !== "all") {
            query.isUserActive = isUserActive
        }

        if (roles.length > 0) {
            query.role = { $in: roles }
        }

        const options = {
            page: page,
            limit: limit,
            sort: { createdAt: -1 },
            select: "-passwordHash",
            populate: [
                { path: "createdBy", select: "email" },
                { path: "role", select: "roleName contents roleCode" }
            ]
        }

        const users = await userModel.paginate(query, options)

        return {
            status: true,
            statusCode: 200,
            users
        }

    } catch (err) {
        return {
            status: false,
            statusCode: 500,
            message: err.message
        }
    }
}


const updateUserQuery = async (details) => {
    try {
        const { _id, passwordHash, email } = details;


        console.log({ passwordHash })

        if (!_id) {
            return {
                status: false,
                statusCode: 400,
                message: "User ID is required for update"
            };
        }

        // Check if user exists
        const existingUser = await userModel.findById(_id);
        if (!existingUser) {
            return {
                status: false,
                statusCode: 404,
                message: "User not found"
            };
        }

        // Prevent email duplication
        if (email && email !== existingUser.email) {
            const emailExists = await userModel.findOne({ email });
            if (emailExists) {
                return {
                    status: false,
                    statusCode: 400,
                    message: "Email already in use by another user"
                };
            }
        }

        // Check if roles have changed
        let rolesChanged = false;
        if (details.role) {
            const existingRoles = (existingUser.role || []).map(r => r.toString()).sort();
            const newRoles = (details.role || []).map(r => r.toString()).sort();
            if (JSON.stringify(existingRoles) !== JSON.stringify(newRoles)) {
                rolesChanged = true;
            }
        }

        // Clone update payload
        const updatePayload = { ...details };

        // Never update _id
        delete updatePayload._id;

        // Handle password update (only if sent)
        if (passwordHash) {
            updatePayload.passwordHash = await bcrypt.hash(passwordHash, 10);
        } else {
            delete updatePayload.passwordHash;
        }

        // Audit trail
        updatePayload.updatedBy = details.actionTakenBy;
        updatePayload.updatedAt = new Date();

        const updatedUser = await userModel.findByIdAndUpdate(
            _id,
            { $set: updatePayload },
            { new: true, runValidators: true }
        );

        // Send email to Super-Admin if roles/permissions changed
        if (rolesChanged) {
            try {
                const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
                const populatedUser = await userModel.findById(updatedUser._id).populate("role");
                const roleNames = (populatedUser.role || []).map(r => r.roleName).join(", ") || "No Roles Assigned";

                let updaterName = "Admin";
                if (details.actionTakenBy) {
                    const updater = await userModel.findById(details.actionTakenBy);
                    if (updater) {
                        updaterName = `${updater.firstName || ""} ${updater.lastName || ""}`.trim() || updater.fullName || "Admin";
                    }
                }

                await sendNotificationMail({
                    to: adminEmail,
                    subject: "Staff Permissions Updated | Merlion Asset Holdings",
                    title: "Staff Permissions Modified",
                    message: `The permissions/roles for the administrative account below have been modified by ${updaterName}.`,
                    details: [
                        { label: "Staff Name", value: `${updatedUser.firstName || ""} ${updatedUser.lastName || ""}`.trim() || updatedUser.fullName || "Staff" },
                        { label: "Staff Email", value: updatedUser.email },
                        { label: "New Assigned Roles", value: roleNames },
                        { label: "Updated By", value: updaterName },
                        { label: "Update Time", value: new Date().toLocaleString() }
                    ]
                });
            } catch (mailError) {
                console.error("Failed to send staff update email to super-admin:", mailError);
            }
        }

        return {
            status: true,
            statusCode: 200,
            message: "User updated successfully",
            updatedUser
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

const deleteUserQuery = async (ids) => {
    try {
        ids = JSON.parse(ids)
        if (!ids || !Array.isArray(ids) || ids.length == 0) {
            return {
                status: false,
                statusCode: 400,
                message: "Provide an array of user IDs"
            }
        }

        const inValidIds = ids.filter(id => !id.match(/^[0-9a-fA-F]{24}$/))

        if (inValidIds.length > 0) {
            return {
                status: false,
                statusCode: 400,
                message: "Invalid mongoDb ObjectId(s)",
                inValidIds
            }
        }

        const result = await userModel.deleteMany({ _id: { $in: ids } })

        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} user(s) delete successfully`,
            deletedCount: result.deletedCount
        }

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        }
    }
}


const resetPasswordByAdminQuery = async (details) => {
    try {

        const { id, password, sendPasswordMail } = details

        let isExistUser = await userModel.findOne({ _id: id })


        if (!isExistUser) {
            return {
                status: false,
                statusCode: 404,
                message: "User not found"
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Clone update payload
        const updatePayload = { ...details };

        updatePayload.passwordHash = hashedPassword
        updatePayload.refreshToken = null

        const updatedUser = await userModel.findByIdAndUpdate(
            { _id: id },
            { $set: updatePayload },
            { new: true, runValidators: true }
        );

        if (sendPasswordMail) {
            await sendUserWelcomeMail({ fullName: updatedUser.fullName, email: updatedUser.email, plainPassword: password, sendPasswordMail })
        }

        return {
            status: true,
            statusCode: 200,
            message: "Password reset successfully",
            updatedUser
        }
    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
}

const submitKycQuery = async (userId, details) => {
    try {
        const { liveSelfie, governmentIdFront, governmentIdBack } = details;

        if (!liveSelfie || !governmentIdFront || !governmentIdBack) {
            return {
                status: false,
                statusCode: 400,
                message: "All fields (live camera photo, Govt ID front, and Govt ID back side photos) are required."
            };
        }

        const user = await userModel.findById(userId);
        if (!user) {
            return {
                status: false,
                statusCode: 404,
                message: "User not found."
            };
        }

        user.kycStatus = "under_review";
        user.kycVerification = {
            liveSelfie,
            governmentIdFront,
            governmentIdBack,
            submittedAt: new Date()
        };

        await user.save();

        // Send notification to Admin
        try {
            const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
            await sendNotificationMail({
                to: adminEmail,
                subject: `User KYC Submitted: ${user.firstName || ""} ${user.lastName || ""}`,
                title: "User KYC Submitted",
                message: `User ${user.firstName || ""} ${user.lastName || ""} has submitted identity verification (KYC) documents and is now under review.`,
                details: [
                    { label: "User Name", value: user.fullName || `${user.firstName || ""} ${user.lastName || ""}` },
                    { label: "Email", value: user.email },
                    { label: "Status", value: "Under Review" }
                ]
            });
        } catch (adminEmailError) {
            console.error("Failed to send admin notification for user KYC submission:", adminEmailError);
        }

        return {
            status: true,
            statusCode: 200,
            message: "KYC documents submitted successfully. Status is now Under Review.",
            user
        };
    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

const approveKycQuery = async (userId) => {
    try {
        const user = await userModel.findById(userId);
        if (!user) {
            return {
                status: false,
                statusCode: 404,
                message: "User not found."
            };
        }

        user.kycStatus = "approved";
        if (user.kycVerification) {
            user.kycVerification.verifiedAt = new Date();
        }
        await user.save();

        return {
            status: true,
            statusCode: 200,
            message: "KYC successfully approved! Your dashboard is now live.",
            user
        };
    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

module.exports = {
    authQuery,
    signUpQuery,
    verifyOtpQuery,
    resendOtpQuery,
    forgotPasswordQuery,
    createUserQuery,
    getUserQuery,
    updateUserQuery,
    deleteUserQuery,
    resetPasswordByAdminQuery,
    submitKycQuery,
    approveKycQuery
};
