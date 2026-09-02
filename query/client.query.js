const { default: sendOtpMail } = require("../emailTemplate/sendOtpMail");
const { default: sendWelcomeMail } = require("../emailTemplate/sendWelcomeMail");
const { default: sendNotificationMail } = require("../emailTemplate/sendNotificationMail");
const { default: sendCredentialsMail } = require("../emailTemplate/sendCredentialsMail");
const clientModel = require("../models/client.model");
const agentModel = require("../models/agent.model");
const userModel = require("../models/user.model");
const otpVerificationModel = require("../models/otpVerification.model");
const bcrypt = require("bcryptjs");
const generateUniqueReferralCode = require("../utils/generateRefferalCode");
const referalsModel = require("../models/referals.model");
const mongoose = require("mongoose");
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require("../services/jwt.service");
const cloudinary = require("../utils/cloudinary");


const authQuery = async (details) => {
    const { email, password } = details;

    if (!email || !password) {
        return { status: false, statusCode: 400, message: "email and password is required" };
    }

    const client = await clientModel.findOne({ email });

    if (!client) {
        return { status: false, statusCode: 401, message: "invalid email" };
    }

    const ok = await bcrypt.compare(password, client.passwordHash);
    if (!ok) {
        return { status: false, statusCode: 401, message: "invalid password" };
    }

    if (!client.isVerified) {
        // Agent-registered clients verify their email at first login: the
        // credentials are correct, so issue an OTP now and ask the client to
        // enter it. Self-registered clients must still verify from the OTP that
        // was sent to them at registration time.
        if (client.registeredByAgent) {
            const normalizedEmail = client.email;
            const existingOtp = await otpVerificationModel.findOne({ email: normalizedEmail });

            // Reuse a still-valid OTP; otherwise issue a fresh one.
            if (!existingOtp || existingOtp.otpExpires < Date.now()) {
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const otpExpires = Date.now() + 5 * 60 * 1000;

                if (existingOtp) {
                    existingOtp.otpCode = otp;
                    existingOtp.otpExpires = otpExpires;
                    await existingOtp.save();
                } else {
                    await otpVerificationModel.create({ email: normalizedEmail, otpCode: otp, otpExpires });
                }

                await sendOtpMail(normalizedEmail, otp, "Your Login Verification OTP");
            }

            return {
                status: false,
                statusCode: 403,
                otpRequired: true,
                message: "Verification required. A one-time passcode has been sent to your email.",
                email: normalizedEmail,
                registeredByAgent: true
            };
        }

        return {
            status: false,
            statusCode: 403,
            message: "Please verify your email first.",
            email: client.email,
            registeredByAgent: client.registeredByAgent || false
        };
    }

    const accessToken = signAccessToken({ sub: client._id, role: ["Client"], email: client.email });
    const refreshToken = signRefreshToken({ sub: client._id });

    client.refreshToken = refreshToken;
    await client.save();

    return {
        status: true,
        statusCode: 200,
        message: "Logged in. Welcome to Client Portal!",
        accessToken,
        refreshToken,
        user: client
    };
};


const registerClientQuery = async (details) => {
    try {
        const {
            firstName,
            lastName,
            email,
            password,
            referralCode
        } = details;

        const registeredByAgent = details.registeredByAgent === true;

        const normalizedEmail = email.toLowerCase().trim();

        // ===========================
        // CHECK EXISTING CLIENT
        // ===========================

        const existingClient = await clientModel.findOne({
            email: normalizedEmail
        });

        if (existingClient && existingClient.isVerified) {
            return {
                status: false,
                statusCode: 400,
                message:
                    "Email already registered and verified. Try logging in."
            };
        }

        // ===========================
        // CHECK EXISTING OTP
        // ===========================

        const existingOtp = await otpVerificationModel.findOne({
            email: normalizedEmail
        });

        if (existingClient && !existingClient.isVerified) {
            if (existingOtp) {
                const otpExpired =
                    new Date(existingOtp.otpExpires) < new Date();

                if (otpExpired) {
                    await clientModel.deleteOne({
                        email: normalizedEmail
                    });

                    await otpVerificationModel.deleteMany({
                        email: normalizedEmail
                    });
                } else {
                    return {
                        status: false,
                        statusCode: 400,
                        message:
                            "An OTP has already been sent. Please try again after 5 minutes."
                    };
                }
            } else if (existingClient.registeredByAgent) {
                // Agent-registered clients have no OTP at registration (they get
                // credentials by email and verify at first login). Don't create
                // a duplicate — the account already exists and is pending
                // first-login verification.
                return {
                    status: false,
                    statusCode: 400,
                    message:
                        "This client already has an account. They can log in with the credentials that were emailed to them."
                };
            } else {
                // Unverified self-registered client with no pending OTP: clear
                // the stale record so registration can start fresh.
                await clientModel.deleteOne({ email: normalizedEmail });
                await otpVerificationModel.deleteMany({ email: normalizedEmail });
            }
        }

        // ===========================
        // VALIDATE REFERRAL CODE
        // ===========================

        let referrer = null;
        let referrerType = null;

        if (referralCode) {
            const normalizedReferralCode = referralCode.trim().toUpperCase();
            // Check Agent referral code
            const agent = await agentModel.findOne({
                referralCode: normalizedReferralCode
            });

            if (agent) {
                if (["inactive", "suspended", "blocked", "closed"].includes(agent.status)) {
                    return {
                        status: false,
                        statusCode: 400,
                        message: "Referral code has expired or is invalid."
                    };
                }
                referrer = agent;
                referrerType = "Agent";
            }

            // Check Client referral code
            if (!referrer) {
                const client = await clientModel.findOne({
                    referralCode: normalizedReferralCode
                });

                if (client) {
                    if (["inactive", "suspended", "blocked", "closed"].includes(client.status)) {
                        return {
                            status: false,
                            statusCode: 400,
                            message: "Referral code has expired or is invalid."
                        };
                    }
                    referrer = client;
                    referrerType = "Client";
                }
            }

            if (!referrer) {
                return {
                    status: false,
                    statusCode: 400,
                    message: "Invalid referral code."
                };
            }
        }

        // ===========================
        // HASH PASSWORD
        // ===========================

        const hashedPassword = await bcrypt.hash(password, 10);

        // ===========================
        // GENERATE OTP
        // (self-registered clients verify at registration; agent-registered
        //  clients instead receive their credentials by email and verify with
        //  an OTP at their first login — see authQuery.)
        // ===========================

        const otp = Math.floor(
            100000 + Math.random() * 900000
        ).toString();

        // ===========================
        // CREATE CLIENT
        // ===========================

        const generatedReferralCode =
            await generateUniqueReferralCode();

        const newClient = await clientModel.create({
            ...details,

            firstName,
            lastName,

            email: normalizedEmail,

            passwordHash: hashedPassword,

            isVerified: false,

            clientId: `MAH-CLIENT-${Date.now()}`,

            referralCode: generatedReferralCode,

            agent:
                referrerType === "Agent"
                    ? referrer._id
                    : (referrerType === "Client" && referrer.agent ? referrer.agent : null),

            registeredByAgent: details.registeredByAgent || false
        });

        // ===========================
        // UPDATE REFERRERS & CREATE REFERRAL RECORD
        // ===========================

        if (referrerType === "Agent") {
            await agentModel.findByIdAndUpdate(referrer._id, {
                $push: { referredClients: newClient._id },
                $inc: { totalClients: 1 }
            });
            const { syncAgentStats } = require("./agent.query");
            await syncAgentStats(referrer._id);
        } else if (referrerType === "Client") {
            // Update referrer Client
            await clientModel.findByIdAndUpdate(referrer._id, {
                $push: { referredClients: newClient._id },
                $inc: { totalClients: 1 }
            });

            // Update referrer Agent (if linked)
            if (referrer.agent) {
                await agentModel.findByIdAndUpdate(referrer.agent, {
                    $push: { referredClients: newClient._id },
                    $inc: { totalClients: 1 }
                });
                const { syncAgentStats } = require("./agent.query");
                await syncAgentStats(referrer.agent);
            }
        }

        if (referrer) {
            await referalsModel.create({
                referrerType,
                referrer: referrer._id,
                client: newClient._id,
                referralCodeUsed: referralCode
            });
        }

        // ===========================
        // SEND CREDENTIALS (agent flow) OR OTP (self-registration)
        // ===========================

        if (registeredByAgent) {
            // Agent registered on the client's behalf: email the login
            // credentials. The OTP is issued when the client first logs in.
            let agentName = null;
            if (referrerType === "Agent" && referrer) {
                agentName = `${referrer.firstName || ""} ${referrer.lastName || ""}`.trim() || null;
            }

            await sendCredentialsMail(normalizedEmail, {
                firstName,
                email: normalizedEmail,
                password,
                agentName
            });
        } else {
            // Self-registration: create OTP record and email the code.
            await otpVerificationModel.create({
                email: normalizedEmail,
                otpCode: otp,
                otpExpires: Date.now() + 5 * 60 * 1000
            });

            await sendOtpMail(
                normalizedEmail,
                otp,
                "Your Registration OTP for Verification"
            );
        }

        // ===========================
        // CREATE ACTIVITY LOG
        // ===========================
        try {
            const { logActivity } = require("../utils/activityLogger");
            await logActivity({
                userId: newClient._id,
                userModel: "Client",
                action: "client.registered",
                category: "profile",
                description: `New client registered: ${newClient.firstName} ${newClient.lastName}`,
                performedBy: referrerType === "Agent" ? { id: referrer._id, role: "agent", name: `${referrer.firstName} ${referrer.lastName}`.trim() } : {}
            });
        } catch (logErr) {
            console.error("Failed to log client registration activity:", logErr);
        }

        // Send notification to Admin
        try {
            const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
            await sendNotificationMail({
                to: adminEmail,
                subject: `New Client Signup Initiated: ${newClient.firstName} ${newClient.lastName}`,
                title: "Client Signup Initiated",
                message: `A new client has initiated registration on Merlion Asset Holdings and is pending email verification.`,
                details: [
                    { label: "Name", value: `${newClient.firstName} ${newClient.lastName}` },
                    { label: "Email", value: newClient.email },
                    { label: "Client ID", value: newClient.clientId },
                    { label: "Status", value: "Pending OTP Verification" }
                ]
            });
        } catch (adminEmailError) {
            console.error("Failed to send admin notification for client signup:", adminEmailError);
        }

        // ===========================
        // RESPONSE
        // ===========================

        return {
            status: true,
            statusCode: 200,
            message: registeredByAgent
                ? "Client registered successfully. Login credentials have been emailed to the client."
                : "Client registered successfully. OTP sent to your email.",
            client: {
                _id: newClient._id,
                clientId: newClient.clientId,
                firstName: newClient.firstName,
                lastName: newClient.lastName,
                email: newClient.email,
                referralCode: newClient.referralCode
            }
        };

    } catch (error) {
        console.error(error);

        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};


const verifyClientOtpQuery = async (details) => {
    try {
        const { email, otp } = details;
        // 1. Check user exists
        const client = await clientModel.findOne({ email });
        if (!client) {
            return {
                status: false,
                statusCode: 400,
                message: "Client not found. Please register first."
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
        await clientModel.updateOne(
            { email },
            {
                $set: {
                    isVerified: true,
                }
            }
        );

        // Remove OTP from OTP collection
        await otpVerificationModel.deleteOne({ email });

        await sendWelcomeMail(email, "Action Required: Complete Your Merlion Asset Holdings KYC Verification")

        // Send notification to Admin & Agent Referral
        try {
            const client = await clientModel.findOne({ email });
            if (client) {
                const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
                await sendNotificationMail({
                    to: adminEmail,
                    subject: `New Client Registered: ${client.firstName} ${client.lastName}`,
                    title: "New Client Registration",
                    message: "A new client has successfully registered and verified their email address on Merlion Asset Holdings.",
                    details: [
                        { label: "Name", value: `${client.firstName} ${client.lastName}` },
                        { label: "Email", value: client.email },
                        { label: "Client ID", value: client.clientId },
                        { label: "Registered At", value: new Date(client.createdAt).toLocaleString() }
                    ]
                });

                // Send notification to referral Agent
                if (client.agent) {
                    const agent = await agentModel.findById(client.agent);
                    if (agent) {
                        await sendNotificationMail({
                            to: agent.email,
                            subject: "New Referral Registered! | Merlion Asset Holdings",
                            title: "New Referral Registered",
                            message: `Congratulations! A new client, ${client.firstName} ${client.lastName}, has completed email verification and registered under your referral code.`,
                            details: [
                                { label: "Client Name", value: `${client.firstName} ${client.lastName}` },
                                { label: "Client Email", value: client.email },
                                { label: "Client ID", value: client.clientId },
                                { label: "Registration Date", value: new Date(client.createdAt).toLocaleDateString() }
                            ]
                        });
                    }
                }
            }
        } catch (emailError) {
            console.error("Failed to send registration/referral emails:", emailError);
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


const resendClientOtpQuery = async (details) => {
    try {
        const { email } = details;

        const existingUser = await clientModel.findOne({ email });

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
                    "Your Registration OTP for Verification",
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
            "Your Registration OTP for Verification",
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


const clientListQuery = async ({ page = 1, limit = 10, search, status, kycStatus, riskProfile, country, preferredCurrency, agent }) => {
    try {
        let matchQuery = {}

        if (search && search.trim()) {
            matchQuery.$or = [
                {
                    fullName: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    firstName: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    lastName: {
                        $regex: search,
                        $options: "i"
                    }
                },
            ]
        }

        if (status) matchQuery.status = status;
        if (kycStatus) matchQuery.kycStatus = kycStatus;
        if (riskProfile) matchQuery.riskProfile = riskProfile;
        if (country) matchQuery.country = country;
        if (preferredCurrency) matchQuery.preferredCurrency = preferredCurrency;
        if (agent && mongoose.Types.ObjectId.isValid(agent)) {
            matchQuery.agent = new mongoose.Types.ObjectId(agent);
        }

        const aggregate = clientModel.aggregate([
            // CLIENT MATCH
            {
                $match: matchQuery
            },

            // AGENT LOOKUP
            {
                $lookup: {
                    from: "Agents",
                    localField: "agent",
                    foreignField: "_id",
                    as: "agent"
                }
            },

            {
                $unwind: {
                    path: "$agent",
                    preserveNullAndEmptyArrays: true
                }
            },

            // ACCOUNT MANAGER LOOKUP (separate from referral/commission agent)
            {
                $lookup: {
                    from: agentModel.collection.name,
                    let: { managerId: "$accountManager" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$managerId"] } } },
                        {
                            $project: {
                                _id: 1,
                                agentId: 1,
                                fullName: 1,
                                firstName: 1,
                                lastName: 1,
                                email: 1,
                                phoneNumber: 1,
                                profileImage: 1,
                                agentLevel: 1,
                                status: 1,
                                kycStatus: 1
                            }
                        }
                    ],
                    as: "accountManager"
                }
            },
            {
                $unwind: {
                    path: "$accountManager",
                    preserveNullAndEmptyArrays: true
                }
            },

            // KYC verifiedBy LOOKUP
            {
                $lookup: {
                    from: "users",
                    localField: "kycVerification.verifiedBy",
                    foreignField: "_id",
                    as: "kycVerifiedByUser"
                }
            },

            {
                $addFields: {
                    "kycVerification.verifiedBy": {
                        $arrayElemAt: ["$kycVerifiedByUser", 0]
                    }
                }
            },

            {
                $project: {
                    kycVerifiedByUser: 0
                }
            },

            // REFERRAL LOOKUP
            {
                $lookup: {
                    from: referalsModel.collection.name,
                    localField: "_id",
                    foreignField: "client",
                    as: "referral"
                }
            },
            {
                $unwind: {
                    path: "$referral",
                    preserveNullAndEmptyArrays: true
                }
            },

            // REFERRER AGENT LOOKUP
            {
                $lookup: {
                    from: agentModel.collection.name,
                    localField: "referral.referrer",
                    foreignField: "_id",
                    as: "referrerAgent"
                }
            },
            {
                $unwind: {
                    path: "$referrerAgent",
                    preserveNullAndEmptyArrays: true
                }
            },

            // REFERRER CLIENT LOOKUP
            {
                $lookup: {
                    from: clientModel.collection.name,
                    localField: "referral.referrer",
                    foreignField: "_id",
                    as: "referrerClient"
                }
            },
            {
                $unwind: {
                    path: "$referrerClient",
                    preserveNullAndEmptyArrays: true
                }
            },

            // ADD FIELDS FOR referredBy
            {
                $addFields: {
                    referredBy: {
                        $cond: {
                            if: { $eq: ["$referral.referrerType", "Agent"] },
                            then: {
                                _id: "$referrerAgent._id",
                                name: {
                                    $trim: {
                                        input: {
                                            $concat: [
                                                { $ifNull: ["$referrerAgent.firstName", ""] },
                                                " ",
                                                { $ifNull: ["$referrerAgent.lastName", ""] }
                                            ]
                                        }
                                    }
                                },
                                email: "$referrerAgent.email",
                                type: "Agent",
                                code: "$referral.referralCodeUsed"
                            },
                            else: {
                                $cond: {
                                    if: { $eq: ["$referral.referrerType", "Client"] },
                                    then: {
                                        _id: "$referrerClient._id",
                                        name: {
                                            $trim: {
                                                input: {
                                                    $concat: [
                                                        { $ifNull: ["$referrerClient.firstName", ""] },
                                                        " ",
                                                        { $ifNull: ["$referrerClient.lastName", ""] }
                                                    ]
                                                }
                                            }
                                        },
                                        email: "$referrerClient.email",
                                        type: "Client",
                                        code: "$referral.referralCodeUsed"
                                    },
                                    else: null
                                }
                            }
                        }
                    }
                }
            },

            // PROJECT OUT UNNECESSARY LOOKUP ARRAYS
            {
                $project: {
                    referral: 0,
                    referrerAgent: 0,
                    referrerClient: 0
                }
            }
        ])

        const options = {
            page,
            limit
        }

        const clients = await clientModel.aggregatePaginate(aggregate, options)

        return {
            status: true,
            statusCode: 200,
            clients
        }

    } catch (error) {
        return {
            status: true,
            statusCode: 500,
            message: error.message
        }
    }
}


const editClientQuery = async (details) => {
    try {
        const { _id, ...updateFields } = details;

        if (!_id) {
            return {
                status: false,
                statusCode: 400,
                message: "Client _id is required."
            };
        }

        const restrictedFields = [
            "email",
            "passwordHash",
            "refreshToken",
            "isVerified",
            "clientId",
            "referralCode",
            "totalInvestments",
            "activeInvestments",
            "completedInvestments",
            "totalInvestedAmount",
            "activeInvestmentAmount",
            "portfolioValue",
            "totalProfitEarned",
            "totalInterestEarned",
            "totalDeposits",
            "totalWithdrawals",
            "availableBalance",
            "createdBy",
            "updatedBy",
            "accountManager",
            "accountManagerAssignedAt",
            "accountManagerAssignedBy",
        ];

        const sanitized = Object.fromEntries(
            Object.entries(updateFields).filter(([key]) => !restrictedFields.includes(key))
        );

        if (Object.keys(sanitized).length === 0) {
            return {
                status: false,
                statusCode: 400,
                message: "No valid fields provided to update."
            };
        }

        const client = await clientModel.findById(_id);

        if (!client) {
            return {
                status: false,
                statusCode: 404,
                message: "Client not found."
            };
        }

        const oldKycStatus = client.kycStatus;
        const newKycStatus = sanitized.kycStatus;
        const oldStatus = client.status;
        const newStatus = sanitized.status;

        // Auto-update fullName if firstName or lastName is updated
        if (sanitized.firstName !== undefined || sanitized.lastName !== undefined) {
            const currentFirstName = sanitized.firstName !== undefined ? sanitized.firstName : client.firstName;
            const currentLastName = sanitized.lastName !== undefined ? sanitized.lastName : client.lastName;
            sanitized.fullName = `${currentFirstName || ""} ${currentLastName || ""}`.trim();
        }

        const updatedClient = await clientModel.findByIdAndUpdate(
            _id,
            { $set: sanitized },
            { new: true, runValidators: true }
        ).select("-passwordHash -refreshToken");

        if (sanitized.status !== undefined && updatedClient.agent) {
            const { syncAgentStats } = require("./agent.query");
            await syncAgentStats(updatedClient.agent);
        }

        // Send notifications based on changes
        try {
            if (newKycStatus && newKycStatus !== oldKycStatus) {
                const remarks = (sanitized.kycVerification && sanitized.kycVerification.remarks) || sanitized.notes || client.notes || "No additional remarks.";
                if (newKycStatus === "approved") {
                    await sendNotificationMail({
                        to: client.email,
                        subject: "Your KYC Verification is Approved | Merlion Asset Holdings",
                        title: "KYC Verification Approved",
                        message: "Congratulations! Your identity verification documents have been successfully reviewed and approved. Your account is now fully verified.",
                        details: [
                            { label: "Client ID", value: client.clientId },
                            { label: "KYC Status", value: "Approved" },
                            { label: "Remarks / Notes", value: remarks }
                        ]
                    });
                } else if (newKycStatus === "rejected") {
                    await sendNotificationMail({
                        to: client.email,
                        subject: "Action Required: KYC Verification Rejected | Merlion Asset Holdings",
                        title: "KYC Verification Rejected",
                        message: "Your identity verification documents were reviewed and could not be approved at this time.",
                        details: [
                            { label: "Remarks / Reason", value: remarks },
                            { label: "Next Steps", value: "Please log in to your dashboard, review the remarks, and re-submit valid identity verification documents." }
                        ]
                    });
                }
            }

            if (newStatus && newStatus !== oldStatus) {
                let subject = "";
                let title = "";
                let message = "";
                if (newStatus === "active") {
                    subject = "Your Account is Activated | Merlion Asset Holdings";
                    title = "Account Activated";
                    message = "Your Merlion Asset Holdings client account is now active. You can log in and start using all active portfolio management services.";
                } else if (newStatus === "suspended") {
                    subject = "Your Account has been Suspended | Merlion Asset Holdings";
                    title = "Account Suspended";
                    message = "Your Merlion Asset Holdings account has been suspended by administration. Please contact your Relationship Manager for further assistance.";
                } else if (newStatus === "blocked") {
                    subject = "Your Account has been Blocked | Merlion Asset Holdings";
                    title = "Account Blocked";
                    message = "Your Merlion Asset Holdings account has been blocked. If you believe this is an error, please reach out to customer support immediately.";
                } else if (newStatus === "closed") {
                    subject = "Your Account is Closed | Merlion Asset Holdings";
                    title = "Account Closed";
                    message = "Your Merlion Asset Holdings account has been closed. We hope to serve you again in the future.";
                }

                if (subject) {
                    await sendNotificationMail({
                        to: client.email,
                        subject,
                        title,
                        message,
                        details: [
                            { label: "Account ID", value: client.clientId },
                            { label: "Account Status", value: newStatus.charAt(0).toUpperCase() + newStatus.slice(1) }
                        ]
                    });
                }
            }
        } catch (notifError) {
            console.error("Failed to send status update email to client:", notifError);
        }

        return {
            status: true,
            statusCode: 200,
            message: "Client updated successfully.",
            client: updatedClient
        };

    } catch (error) {
        console.error(error);
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};


const deleteClientQuery = async (ids) => {
    try {
        console.log({ ids })
        ids = JSON.parse(ids);

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return {
                status: false,
                statusCode: 400,
                message: "Provide an array of client id"
            };
        }

        // Validate MongoDB ObjectIds
        const inValidIds = ids.filter(id => !id.match(/^[0-9a-fA-F]{24}$/));

        if (inValidIds.length > 0) {
            return {
                status: false,
                statusCode: 400,
                message: "Invalid mongoDB ObjectId(s)",
                inValidIds
            };
        }

        // Find agents linked to the clients to be deleted
        const clientsToDelete = await clientModel.find({ _id: { $in: ids } }).select("agent");
        const agentsToSync = [...new Set(clientsToDelete.filter(c => c.agent).map(c => c.agent.toString()))];

        // STEP 2: Delete client records
        const result = await clientModel.deleteMany({ _id: { $in: ids } });

        // Update agents' referredClients arrays and sync stats
        if (agentsToSync.length > 0) {
            const { syncAgentStats } = require("./agent.query");
            for (const agentId of agentsToSync) {
                await agentModel.updateOne(
                    { _id: agentId },
                    { $pull: { referredClients: { $in: ids } } }
                );
                await syncAgentStats(agentId);
            }
        }


        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} client(s) deleted successfully`,
            deletedCount: result.deletedCount,
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
}

const getClientByIdQuery = async (id) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid client id." };
        }

        const bankDetailModel = require("../models/bankDetail.model");
        const walletDetailModel = require("../models/walletDetail.model");

        const client = await clientModel.findById(id)
            .select("-passwordHash -refreshToken")
            .populate("agent", "firstName lastName email agentId")
            .populate("accountManager", "agentId fullName firstName lastName email phoneNumber profileImage agentLevel status kycStatus")
            .populate("accountManagerAssignedBy", "firstName lastName email")
            .populate("kycVerification.verifiedBy", "firstName lastName email")
            .populate("createdBy", "firstName lastName email")
            .populate("updatedBy", "firstName lastName email")
            .lean();

        if (!client) {
            return { status: false, statusCode: 404, message: "Client not found." };
        }

        const [bankDetails, wallets] = await Promise.all([
            bankDetailModel.find({ userId: client._id, userModel: "Client" }).sort({ isPrimary: -1, createdAt: -1 }).lean(),
            walletDetailModel.find({ userId: client._id, userModel: "Client" }).sort({ isPrimary: -1, createdAt: -1 }).lean(),
        ]);

        return {
            status: true,
            statusCode: 200,
            data: { ...client, bankDetails, wallets },
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

const assignAccountManagerQuery = async ({ clientId, accountManagerId, adminId }) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(clientId)) {
            return { status: false, statusCode: 400, message: "Invalid client ID." };
        }

        const client = await clientModel.findById(clientId);
        if (!client) return { status: false, statusCode: 404, message: "Client not found." };
        if (accountManagerId !== null && accountManagerId !== undefined && accountManagerId !== "") {
            if (client.kycStatus !== "approved") {
                return {
                    status: false,
                    statusCode: 400,
                    message: "An Account Manager can only be assigned after the client's KYC is approved."
                };
            }
            if (!mongoose.Types.ObjectId.isValid(accountManagerId)) {
                return { status: false, statusCode: 400, message: "Invalid Account Manager ID." };
            }
            const manager = await agentModel.findOne({
                _id: accountManagerId,
                status: "active",
                kycStatus: "approved"
            }).lean();
            if (!manager) {
                return { status: false, statusCode: 400, message: "Select an active agent whose KYC is approved." };
            }
            client.accountManager = manager._id;
            client.accountManagerAssignedAt = new Date();
            client.accountManagerAssignedBy = adminId || null;
        } else {
            client.accountManager = null;
            client.accountManagerAssignedAt = null;
            client.accountManagerAssignedBy = adminId || null;
        }

        await client.save();
        const updatedClient = await clientModel.findById(clientId)
            .select("-passwordHash -refreshToken")
            .populate("accountManager", "agentId fullName firstName lastName email phoneNumber profileImage agentLevel status kycStatus")
            .populate("accountManagerAssignedBy", "firstName lastName email")
            .lean();

        try {
            const manager = updatedClient.accountManager;
            await sendNotificationMail({
                to: updatedClient.email,
                subject: manager ? "Your Account Manager Has Been Assigned | Merlion Asset Holdings" : "Account Manager Update | Merlion Asset Holdings",
                title: manager ? "Meet Your Account Manager" : "Account Manager Removed",
                message: manager
                    ? `Hi ${updatedClient.firstName || "there"}, ${manager.fullName || `${manager.firstName || ""} ${manager.lastName || ""}`.trim()} is now your Account Manager and can guide you through investment plans and assist whenever you need help.`
                    : `Hi ${updatedClient.firstName || "there"}, your Account Manager assignment has been removed. New investments will remain unavailable until another manager is assigned.`,
                details: manager ? [
                    { label: "Account Manager", value: manager.fullName || `${manager.firstName || ""} ${manager.lastName || ""}`.trim() },
                    { label: "Agent ID", value: manager.agentId },
                    { label: "Email", value: manager.email },
                    ...(manager.phoneNumber ? [{ label: "Phone", value: manager.phoneNumber }] : [])
                ] : [{ label: "Status", value: "Awaiting assignment" }]
            });
        } catch (mailError) {
            console.error("Account Manager notification email failed:", mailError.message || mailError);
        }

        return {
            status: true,
            statusCode: 200,
            message: updatedClient.accountManager ? "Account Manager assigned successfully." : "Account Manager removed successfully.",
            data: updatedClient
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

const forgotPasswordClientQuery = async ({ email, password }) => {
    try {
        if (!email || !password) {
            return { status: false, statusCode: 400, message: "Email and new password are required." };
        }

        const client = await clientModel.findOne({ email });
        if (!client) {
            return { status: false, statusCode: 404, message: "No account found with that email address." };
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await clientModel.updateOne({ email }, { $set: { passwordHash: hashedPassword } });

        try {
            const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
            await sendNotificationMail({
                to: client.email,
                subject: "Password Changed | Merlion Asset Holdings",
                title: "Password Changed Successfully",
                message: `Hi ${client.firstName || client.fullName || "there"}, your account password has been reset successfully. If you did not request this change, please contact support immediately.`,
                details: [
                    { label: "Account Email", value: client.email },
                    { label: "Action", value: "Password Reset" }
                ]
            });
            await sendNotificationMail({
                to: adminEmail,
                subject: `Client Password Reset: ${client.firstName || ""} ${client.lastName || ""}`,
                title: "Client Password Reset",
                message: `Client ${client.firstName || ""} ${client.lastName || ""} has reset their password.`,
                details: [
                    { label: "Client Email", value: client.email },
                    { label: "Client ID", value: client.clientId }
                ]
            });
        } catch (emailErr) {
            console.error("Password reset email failed:", emailErr);
        }

        return { status: true, statusCode: 200, message: "Password changed successfully." };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};


const refreshClientQuery = async (refreshToken) => {
    try {
        if (!refreshToken) {
            return { status: false, statusCode: 401, message: "Refresh token required." };
        }

        let payload;
        try {
            payload = verifyRefreshToken(refreshToken);
        } catch {
            return { status: false, statusCode: 403, message: "Invalid or expired refresh token." };
        }

        const client = await clientModel.findById(payload.sub);
        if (!client || client.refreshToken !== refreshToken) {
            return { status: false, statusCode: 403, message: "Invalid refresh token." };
        }

        const newAccessToken = signAccessToken({ sub: client._id, role: ["Client"], email: client.email });

        return { status: true, statusCode: 200, accessToken: newAccessToken };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};


const logoutClientQuery = async (refreshToken) => {
    try {
        if (!refreshToken) {
            return { status: true, statusCode: 200, message: "Logged out." };
        }

        const client = await clientModel.findOne({ refreshToken });
        if (client) {
            client.refreshToken = null;
            await client.save();
        }

        return { status: true, statusCode: 200, message: "Logged out successfully." };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};


const submitKycClientQuery = async (clientId, details) => {
    try {
        const { liveSelfie, governmentIdFront, governmentIdBack, governmentIdType, governmentIdNumber, selfDeclarationVideo } = details;

        if (!liveSelfie || !governmentIdFront || !governmentIdBack || !selfDeclarationVideo || !governmentIdType || !governmentIdNumber) {
            return {
                status: false,
                statusCode: 400,
                message: "All KYC documents, government ID details, and declaration video are required."
            };
        }

        const client = await clientModel.findById(clientId);
        if (!client) {
            return { status: false, statusCode: 404, message: "Client not found." };
        }

        if (client.kycStatus === "approved") {
            return { status: false, statusCode: 400, message: "KYC is already approved." };
        }

        const allowedIdTypes = ["Passport", "National Id", "Driving License", "Voter Id", "Aadhar", "PAN", "Other"];
        if (!allowedIdTypes.includes(governmentIdType)) {
            return { status: false, statusCode: 400, message: "Invalid government ID type." };
        }

        const displayName = [client.firstName, client.lastName].filter(Boolean).join(" ")
            || client.fullName
            || "client";
        const clientFolderName = displayName
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            || "client";
        const expectedFolder = `/clients/${clientFolderName}/kyc/`;
        const validateCloudinaryUrl = (value, resourceType) => {
            try {
                const url = new URL(value);
                return url.protocol === "https:"
                    && url.hostname === "res.cloudinary.com"
                    && url.pathname.includes(`/${resourceType}/upload/`)
                    && url.pathname.includes(expectedFolder);
            } catch {
                return false;
            }
        };

        if (
            !validateCloudinaryUrl(liveSelfie, "image")
            || !validateCloudinaryUrl(governmentIdFront, "image")
            || !validateCloudinaryUrl(governmentIdBack, "image")
            || !validateCloudinaryUrl(selfDeclarationVideo, "video")
        ) {
            return { status: false, statusCode: 400, message: "One or more KYC upload URLs are invalid." };
        }

        const previousKycAssets = {
            liveSelfie: client.kycVerification?.liveSelfie || null,
            governmentIdFront: client.kycVerification?.governmentIdFront || null,
            governmentIdBack: client.kycVerification?.governmentIdBack || null,
            selfDeclarationVideo: client.kycVerification?.selfDeclarationVideo || null,
        };

        client.kycStatus = "under_review";
        client.kycVerification = {
            ...client.kycVerification,
            liveSelfie,
            governmentIdFront,
            governmentIdBack,
            governmentIdType,
            governmentIdNumber: String(governmentIdNumber).trim(),
            selfDeclarationVideo,
            submittedAt: new Date(),
            verifiedAt: null,
            verifiedBy: null,
            remarks: null
        };
        await client.save();

        // Remove files created by the older timestamp/random-ID upload flow.
        // Stable-ID assets have the same URL/public ID and must not be deleted.
        const extractPublicId = (urlValue, resourceType) => {
            try {
                const pathname = new URL(urlValue).pathname;
                const marker = `/${resourceType}/upload/`;
                const uploadPath = pathname.split(marker)[1];
                if (!uploadPath) return null;
                return decodeURIComponent(uploadPath)
                    .replace(/^v\d+\//, "")
                    .replace(/\.[^/.]+$/, "");
            } catch {
                return null;
            }
        };

        const cleanupCandidates = [
            { oldUrl: previousKycAssets.liveSelfie, newUrl: liveSelfie, resourceType: "image" },
            { oldUrl: previousKycAssets.governmentIdFront, newUrl: governmentIdFront, resourceType: "image" },
            { oldUrl: previousKycAssets.governmentIdBack, newUrl: governmentIdBack, resourceType: "image" },
            { oldUrl: previousKycAssets.selfDeclarationVideo, newUrl: selfDeclarationVideo, resourceType: "video" },
        ].map(item => ({
            ...item,
            oldPublicId: item.oldUrl ? extractPublicId(item.oldUrl, item.resourceType) : null,
            newPublicId: extractPublicId(item.newUrl, item.resourceType),
        })).filter(item => item.oldPublicId && item.oldPublicId !== item.newPublicId);

        const cleanupResults = await Promise.allSettled(
            cleanupCandidates.map(item => {
                return cloudinary.uploader.destroy(item.oldPublicId, {
                    resource_type: item.resourceType,
                    invalidate: true,
                });
            })
        );
        cleanupResults.forEach(result => {
            if (result.status === "rejected") {
                console.error("Previous KYC asset cleanup failed:", result.reason?.message || result.reason);
            }
        });

        try {
            const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
            await sendNotificationMail({
                to: adminEmail,
                subject: `KYC Submitted: ${client.firstName || ""} ${client.lastName || ""}`,
                title: "Client KYC Submitted",
                message: `Client ${client.firstName || ""} ${client.lastName || ""} has submitted KYC documents and is now under review.`,
                details: [
                    { label: "Client Name", value: client.fullName || `${client.firstName || ""} ${client.lastName || ""}` },
                    { label: "Client ID", value: client.clientId },
                    { label: "Email", value: client.email },
                    { label: "Status", value: "Under Review" }
                ]
            });
            await sendNotificationMail({
                to: client.email,
                subject: "KYC Documents Received | Merlion Asset Holdings",
                title: "KYC Submission Received",
                message: `Hi ${client.firstName || "there"}, we have received your KYC documents. Our team will review them and notify you once the verification is complete.`,
                details: [
                    { label: "Status", value: "Under Review" },
                    { label: "Submitted At", value: new Date().toLocaleString() }
                ]
            });
        } catch (emailErr) {
            console.error("KYC submission email failed:", emailErr);
        }

        return { status: true, statusCode: 200, message: "KYC documents submitted successfully. Status is now under review." };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};


const approveKycClientQuery = async ({ clientId, adminId }) => {
    try {
        if (!clientId || !clientId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid client ID." };
        }

        const client = await clientModel.findById(clientId);
        if (!client) {
            return { status: false, statusCode: 404, message: "Client not found." };
        }

        if (client.kycStatus === "approved") {
            return { status: false, statusCode: 400, message: "KYC is already approved." };
        }

        client.kycStatus = "approved";
        if (client.kycVerification) {
            client.kycVerification.verifiedAt = new Date();
            client.kycVerification.verifiedBy = adminId;
            client.kycVerification.remarks = null;
        }
        await client.save();

        try {
            await sendNotificationMail({
                to: client.email,
                subject: "KYC Approved | Merlion Asset Holdings",
                title: "KYC Verification Approved",
                message: `Hi ${client.firstName || "there"}, congratulations! Your identity verification (KYC) has been approved. You now have full access to your Merlion Asset Holdings account.`,
                details: [
                    { label: "Status", value: "Approved" },
                    { label: "Verified At", value: new Date().toLocaleString() }
                ]
            });
        } catch (emailErr) {
            console.error("KYC approval email failed:", emailErr);
        }

        return { status: true, statusCode: 200, message: "KYC approved successfully.", client };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};


const rejectKycClientQuery = async ({ clientId, adminId, remarks }) => {
    try {
        if (!clientId || !clientId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid client ID." };
        }

        const client = await clientModel.findById(clientId);
        if (!client) {
            return { status: false, statusCode: 404, message: "Client not found." };
        }

        if (client.kycStatus === "approved") {
            return { status: false, statusCode: 400, message: "Cannot reject an already approved KYC." };
        }

        client.kycStatus = "rejected";
        if (client.kycVerification) {
            client.kycVerification.verifiedAt = new Date();
            client.kycVerification.verifiedBy = adminId;
            client.kycVerification.remarks = remarks || null;
        }
        await client.save();

        try {
            await sendNotificationMail({
                to: client.email,
                subject: "KYC Verification Rejected | Merlion Asset Holdings",
                title: "KYC Verification Rejected",
                message: `Hi ${client.firstName || "there"}, unfortunately your KYC documents could not be verified. Please resubmit with the correct documents.`,
                details: [
                    { label: "Status", value: "Rejected" },
                    { label: "Reason", value: remarks || "Documents did not meet verification requirements." }
                ]
            });
        } catch (emailErr) {
            console.error("KYC rejection email failed:", emailErr);
        }

        return { status: true, statusCode: 200, message: "KYC rejected.", client };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};


const bulkApproveKycQuery = async ({ ids, adminId }) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { status: false, statusCode: 400, message: "No IDs provided." };
    }

    const approved = [];
    const skipped = [];
    const failed = [];

    for (const id of ids) {
        try {
            const result = await approveKycClientQuery({ clientId: id, adminId });
            if (result.status) approved.push(id);
            else skipped.push({ id, reason: result.message });
        } catch (err) {
            failed.push({ id, reason: err.message });
        }
    }

    return {
        status: true,
        statusCode: 200,
        message: `${approved.length} KYC(s) approved. ${skipped.length} skipped. ${failed.length} failed.`,
        results: { approved, skipped, failed }
    };
};


const bulkRejectKycQuery = async ({ ids, adminId, remarks }) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { status: false, statusCode: 400, message: "No IDs provided." };
    }

    const rejected = [];
    const skipped = [];
    const failed = [];

    for (const id of ids) {
        try {
            const result = await rejectKycClientQuery({ clientId: id, adminId, remarks });
            if (result.status) rejected.push(id);
            else skipped.push({ id, reason: result.message });
        } catch (err) {
            failed.push({ id, reason: err.message });
        }
    }

    return {
        status: true,
        statusCode: 200,
        message: `${rejected.length} KYC(s) rejected. ${skipped.length} skipped. ${failed.length} failed.`,
        results: { rejected, skipped, failed }
    };
};


const resetPortfolioValueQuery = async ({ clientId }) => {
    try {
        if (!clientId || !clientId.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid clientId." };
        }
        const result = await clientModel.findByIdAndUpdate(
            clientId,
            { $set: { portfolioValue: 0, availableBalance: 0 } },
            { new: true }
        );
        if (!result) {
            return { status: false, statusCode: 404, message: "Client not found." };
        }
        return { status: true, statusCode: 200, message: "Portfolio value and available balance reset to zero." };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

module.exports = {
    registerClientQuery,
    verifyClientOtpQuery,
    resendClientOtpQuery,
    clientListQuery,
    editClientQuery,
    deleteClientQuery,
    authQuery,
    getClientByIdQuery,
    forgotPasswordClientQuery,
    refreshClientQuery,
    logoutClientQuery,
    submitKycClientQuery,
    approveKycClientQuery,
    rejectKycClientQuery,
    bulkApproveKycQuery,
    bulkRejectKycQuery,
    resetPortfolioValueQuery,
    assignAccountManagerQuery,
}
