const agentModel = require("../models/agent.model");
const userModel = require("../models/user.model");
const { signAccessToken, signRefreshToken } = require("../services/jwt.service");
const bcrypt = require("bcryptjs");
const { default: sendOtpMail, sendGenericMail } = require("../emailTemplate/sendOtpMail");
const { default: sendWelcomeMail } = require("../emailTemplate/sendWelcomeMail");
const { default: sendNotificationMail } = require("../emailTemplate/sendNotificationMail");
const { passwordChangedTemplate } = require("../services/emailTemplates");
const otpVerificationModel = require("../models/otpVerification.model");
const { uploadToCloudinary } = require("../services/cloudinaryUpload");
const generateUniqueReferralCode = require("../utils/generateRefferalCode");
const generateUniqueAgentId = require("../utils/generateUniqueAgentId");

const authQuery = async (details) => {
    const { email, password } = details;

    if (!email || !password) {
        return { status: false, statusCode: 400, message: "email and password is required" };
    }

    const agent = await agentModel.findOne({ email });

    if (!agent) {
        return { status: false, statusCode: 401, message: "invalid email" };
    }

    if (!agent.isVerified) {
        return { status: false, statusCode: 403, message: "Please verify your email first.", email: agent.email };
    }

    const ok = await bcrypt.compare(password, agent.passwordHash);
    if (!ok) {
        return { status: false, statusCode: 401, message: "invalid password" };
    }

    const accessToken = signAccessToken({ sub: agent._id, role: ["Agent"], email: agent.email });
    const refreshToken = signRefreshToken({ sub: agent._id });

    agent.refreshToken = refreshToken;
    await agent.save();
    await syncAgentStats(agent._id);
    const updatedAgent = await agentModel.findById(agent._id).select("-passwordHash -refreshToken");

    return {
        status: true,
        statusCode: 200,
        message: "Logged in. Welcome to Agent Portal!",
        accessToken,
        refreshToken,
        user: updatedAgent
    };
};

const signUpQuery = async (details) => {
    try {
        const { firstName, lastName, email, password, referralCode } = details;

        const existingAgent = await agentModel.findOne({ email });

        if (existingAgent && existingAgent.isVerified) {
            return {
                status: false,
                statusCode: 400,
                message: "Email already registered and verified. Try logging in."
            };
        }

        // Fetch OTP entry if exists
        const existingOtp = await otpVerificationModel.findOne({ email });

        if (existingAgent && !existingAgent.isVerified) {
            // If OTP exists for this user
            if (existingOtp) {
                const otpExpired = existingOtp.otpExpires < Date.now();

                // OTP expired → delete agent + OTP → recreate
                if (otpExpired) {
                    await agentModel.deleteOne({ email });
                    await otpVerificationModel.deleteOne({ email });
                } else {
                    return {
                        status: true,
                        statusCode: 200,
                        message: "Try again after 5 min."
                    };
                }
            } else {
                await agentModel.deleteOne({ email });
            }
        }

        // Find sponsor agent if sponsor referral code was provided
        let sponsor = null;
        if (referralCode) {
            const normalizedReferralCode = referralCode.trim().toUpperCase();
            sponsor = await agentModel.findOne({ referralCode: normalizedReferralCode });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

        const uniqueAgentId = await generateUniqueAgentId();

        const uniqueRefCode = await generateUniqueReferralCode();

        // Create fresh agent
        const newAgent = await agentModel.create({
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`.trim(),
            email,
            passwordHash: hashedPassword,
            agentId: uniqueAgentId,
            referralCode: uniqueRefCode,
            sponsorAgent: sponsor ? sponsor._id : null,
            isVerified: false,
            status: "pending"
        });

        // Create fresh OTP entry
        await otpVerificationModel.create({
            email,
            otpCode: otp,
            otpExpires: Date.now() + 5 * 60 * 1000 // 5 minutes
        });

        // Send OTP
        console.log(`[DEBUG] OTP for ${newAgent.email} is ${otp}`);
        await sendOtpMail(
            newAgent.email,
            otp,
            "Your Agent Registration OTP for Verification"
        );

        // Send notification to Admin
        try {
            const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
            await sendNotificationMail({
                to: adminEmail,
                subject: `New Agent Signup Initiated: ${newAgent.firstName} ${newAgent.lastName}`,
                title: "Agent Signup Initiated",
                message: `A new agent has initiated registration on Merlion Asset Holdings and is pending email verification.`,
                details: [
                    { label: "Name", value: `${newAgent.firstName} ${newAgent.lastName}` },
                    { label: "Email", value: newAgent.email },
                    { label: "Agent ID", value: newAgent.agentId },
                    { label: "Status", value: "Pending OTP Verification" }
                ]
            });
        } catch (adminEmailError) {
            console.error("Failed to send admin notification for agent signup:", adminEmailError);
        }

        return {
            status: true,
            statusCode: 200,
            message: "Agent registered successfully. OTP sent to your email.",
            newUser: newAgent
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

/** Create an immediately active agent from the authenticated admin application. */
const createAgentByAdminQuery = async (details) => {
    try {
        const firstName = String(details.firstName || "").trim();
        const lastName = String(details.lastName || "").trim();
        const email = String(details.email || "").trim().toLowerCase();
        const password = String(details.password || "");
        const sponsorReferralCode = String(details.referralCode || "").trim().toUpperCase();

        if (!firstName || !lastName || !email || !password) {
            return {
                status: false,
                statusCode: 400,
                message: "First name, last name, email address, and password are required."
            };
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return { status: false, statusCode: 400, message: "Enter a valid email address." };
        }

        if (password.length < 8) {
            return {
                status: false,
                statusCode: 400,
                message: "Password must contain at least 8 characters."
            };
        }

        const existingAgent = await agentModel.exists({ email });
        if (existingAgent) {
            return {
                status: false,
                statusCode: 409,
                message: "An agent account already exists with this email address."
            };
        }

        // The entered referral code belongs to the sponsor; the new agent receives
        // a separate generated referral code that they can share with others.
        let sponsor = null;
        if (sponsorReferralCode) {
            sponsor = await agentModel.findOne({ referralCode: sponsorReferralCode }).select("_id").lean();
            if (!sponsor) {
                return {
                    status: false,
                    statusCode: 400,
                    message: "The referring agent's referral code is invalid."
                };
            }
        }

        const [passwordHash, agentId, referralCode] = await Promise.all([
            bcrypt.hash(password, 10),
            generateUniqueAgentId(),
            generateUniqueReferralCode()
        ]);

        const agent = await agentModel.create({
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            email,
            passwordHash,
            agentId,
            referralCode,
            sponsorAgent: sponsor?._id || null,
            isVerified: true,
            status: "active",
            createdBy: details.createdBy || null
        });

        const safeAgent = agent.toObject();
        delete safeAgent.passwordHash;
        delete safeAgent.refreshToken;

        return {
            status: true,
            statusCode: 201,
            message: "Agent account created successfully.",
            agent: safeAgent
        };
    } catch (error) {
        if (error.code === 11000) {
            return {
                status: false,
                statusCode: 409,
                message: "An agent with the same email address, Agent ID, or referral code already exists."
            };
        }

        return { status: false, statusCode: 500, message: error.message };
    }
};

const verifyOtpQuery = async (details) => {
    try {
        const { email, otp } = details;

        // 1. Check agent exists
        const agent = await agentModel.findOne({ email });
        if (!agent) {
            return {
                status: false,
                statusCode: 400,
                message: "Agent not found. Please register first."
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

        // 5. OTP verified → Update agent + delete OTP record
        await agentModel.updateOne(
            { email },
            {
                $set: {
                    isVerified: true,
                    status: "pending"
                }
            }
        );

        // Remove OTP from OTP collection
        await otpVerificationModel.deleteOne({ email });

        await sendWelcomeMail(email, "Action Required: Complete Your Merlion Asset Holdings Agent KYC Verification");

        // Send notification to Admin
        try {
            const agent = await agentModel.findOne({ email });
            if (agent) {
                const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
                await sendNotificationMail({
                    to: adminEmail,
                    subject: `New Agent Registered: ${agent.firstName} ${agent.lastName}`,
                    title: "New Agent Registration",
                    message: "A new agent has successfully registered and verified their email address on Merlion Asset Holdings.",
                    details: [
                        { label: "Name", value: `${agent.firstName} ${agent.lastName}` },
                        { label: "Email", value: agent.email },
                        { label: "Agent ID", value: agent.agentId },
                        { label: "Registered At", value: new Date(agent.createdAt).toLocaleString() }
                    ]
                });
            }
        } catch (adminEmailError) {
            console.error("Failed to send admin notification for agent registration:", adminEmailError);
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

        const existingAgent = await agentModel.findOne({ email });

        if (!existingAgent) {
            return {
                status: false,
                statusCode: 404,
                message: "Agent not found. Please register first."
            };
        }

        const existingOtp = await otpVerificationModel.findOne({ email });

        if (existingOtp) {
            if (existingOtp.otpExpires < Date.now()) {
                const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

                existingOtp.otpCode = newOtp;
                existingOtp.otpExpires = Date.now() + 5 * 60 * 1000;
                await existingOtp.save();

                console.log(`[DEBUG] Resent OTP (expired check) for ${email} is ${newOtp}`);
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

            return {
                status: false,
                statusCode: 400,
                message: "Your previous OTP is still valid. Please use that."
            };
        }

        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

        await otpVerificationModel.create({
            email,
            otpCode: newOtp,
            otpExpires: Date.now() + 5 * 60 * 1000
        });

        console.log(`[DEBUG] Resent OTP (new entry) for ${email} is ${newOtp}`);
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

        const existingAgent = await agentModel.findOne({ email });

        if (!existingAgent) {
            return {
                status: false,
                statusCode: 400,
                message: "Agent not found. Please register first."
            };
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await agentModel.updateOne(
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
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

// Allowed government ID types (mirrors the mobile app dropdown & schema enum).
const ALLOWED_ID_TYPES = ["Passport", "National Id", "Driving License", "Voter Id", "Aadhar", "PAN", "Other"];

// True when the value is already a hosted Cloudinary URL (mobile apps upload
// directly to Cloudinary and submit the resulting secure_url). Base64/data-URLs
// (used by the web portal) fall through to server-side upload.
const isCloudinaryUrl = (value) =>
    typeof value === "string" && /^https:\/\/res\.cloudinary\.com\//.test(value);

const submitKycQuery = async (userId, details) => {
    try {
        const {
            liveSelfie,
            selfDeclarationVideo,
            governmentIdFront,
            governmentIdBack,
            governmentIdType,
            governmentIdNumber,
        } = details;

        if (!liveSelfie || !selfDeclarationVideo || !governmentIdFront || !governmentIdBack) {
            return {
                status: false,
                statusCode: 400,
                message: "All fields (live camera photo, live camera video, Govt ID front, and Govt ID back side photos) are required."
            };
        }

        // ID type/number are optional for backwards-compat with the older web
        // portal payload, but if a type is supplied it must be a valid one.
        if (governmentIdType && !ALLOWED_ID_TYPES.includes(governmentIdType)) {
            return { status: false, statusCode: 400, message: "Invalid government ID type." };
        }

        const agent = await agentModel.findById(userId);
        if (!agent) {
            return {
                status: false,
                statusCode: 404,
                message: "Agent not found."
            };
        }

        const agentName = (agent.firstName || agent.fullName || "agent").toLowerCase().replace(/[^a-z0-9]/g, "");
        const folderPath = `agent/${agentName}`;

        const now = new Date();
        const pad = (num) => String(num).padStart(2, "0");
        const formattedTimestamp = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

        // Each asset is either already a Cloudinary URL (mobile direct-upload flow)
        // — kept as-is — or a base64/data-URL from the web portal that we upload
        // server-side here. This lets both clients share one endpoint.
        const resolveAsset = (value, { resourceType, publicId }) =>
            isCloudinaryUrl(value)
                ? Promise.resolve(value)
                : uploadToCloudinary(value, { folder: folderPath, public_id: publicId, resource_type: resourceType });

        console.log(`Resolving KYC assets for agent: ${agentName} with timestamp: ${formattedTimestamp}`);

        const [liveSelfieUrl, liveVideoUrl, govtIdFrontUrl, govtIdBackUrl] = await Promise.all([
            resolveAsset(liveSelfie, { resourceType: "image", publicId: `${agentName} live photo_${formattedTimestamp}` }),
            resolveAsset(selfDeclarationVideo, { resourceType: "video", publicId: `${agentName} live video_${formattedTimestamp}` }),
            resolveAsset(governmentIdFront, { resourceType: "image", publicId: `${agentName} govt id (font)_${formattedTimestamp}` }),
            resolveAsset(governmentIdBack, { resourceType: "image", publicId: `${agentName} govt id (back)_${formattedTimestamp}` }),
        ]);

        agent.kycStatus = "under_review";
        agent.kycVerification = {
            ...agent.kycVerification,
            liveSelfie: liveSelfieUrl,
            selfDeclarationVideo: liveVideoUrl,
            governmentIdFront: govtIdFrontUrl,
            governmentIdBack: govtIdBackUrl,
            ...(governmentIdType ? { governmentIdType } : {}),
            ...(governmentIdNumber ? { governmentIdNumber: String(governmentIdNumber).trim() } : {}),
            submittedAt: new Date()
        };

        await agent.save();

        // Send notification to Admin
        try {
            const adminEmail = process.env.ADMIN_EMAIL || "admin@merlionassetholdings.com";
            await sendNotificationMail({
                to: adminEmail,
                subject: `Agent KYC Submitted: ${agent.firstName} ${agent.lastName}`,
                title: "Agent KYC Submitted",
                message: `Agent ${agent.firstName} ${agent.lastName} has submitted identity verification (KYC) documents and is now under review.`,
                details: [
                    { label: "Agent Name", value: agent.fullName },
                    { label: "Email", value: agent.email },
                    { label: "Agent ID", value: agent.agentId },
                    { label: "Status", value: "Under Review" }
                ]
            });
        } catch (adminEmailError) {
            console.error("Failed to send admin notification for agent KYC submission:", adminEmailError);
        }

        return {
            status: true,
            statusCode: 200,
            message: "KYC documents submitted successfully. Status is now Under Review.",
            user: agent
        };
    } catch (error) {
        console.error("KYC submission error:", error);
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

const approveKycQuery = async (userId) => {
    try {
        const agent = await agentModel.findById(userId);
        if (!agent) {
            return {
                status: false,
                statusCode: 404,
                message: "Agent not found."
            };
        }

        agent.kycStatus = "approved";
        agent.status = "active";
        if (agent.kycVerification) {
            agent.kycVerification.verifiedAt = new Date();
        }
        await agent.save();

        // Send notification email
        try {
            await sendNotificationMail({
                to: agent.email,
                subject: "Your Agent KYC Verification is Approved | Merlion Asset Holdings",
                title: "KYC Verification Approved",
                message: "Congratulations! Your agent identity verification documents have been successfully reviewed and approved. Your agent portal is now active.",
                details: [
                    { label: "Agent ID", value: agent.agentId },
                    { label: "KYC Status", value: "Approved" },
                    { label: "Account Status", value: "Active" }
                ]
            });
        } catch (notifError) {
            console.error("Failed to send KYC approval notification to agent:", notifError);
        }

        return {
            status: true,
            statusCode: 200,
            message: "KYC successfully approved! Your agent dashboard is now live.",
            user: agent
        };
    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

const agentListQuery = async ({ page = 1, limit = 10, search, status, kycStatus, agentLevel, country, preferredCurrency }) => {
    try {
        let matchQuery = {};

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
                {
                    email: {
                        $regex: search,
                        $options: "i"
                    }
                },
                {
                    agentId: {
                        $regex: search,
                        $options: "i"
                    }
                }
            ];
        }

        if (status) matchQuery.status = status;
        if (kycStatus) matchQuery.kycStatus = kycStatus;
        if (agentLevel) matchQuery.agentLevel = agentLevel;
        if (country) matchQuery.country = country;
        if (preferredCurrency) matchQuery.preferredCurrency = preferredCurrency;

        const matchingAgents = await agentModel.find(matchQuery).select("_id");
        if (matchingAgents && matchingAgents.length > 0) {
            await Promise.all(matchingAgents.map(a => syncAgentStats(a._id)));
        }

        const aggregate = agentModel.aggregate([
            {
                $match: matchQuery
            },
            {
                $lookup: {
                    from: agentModel.collection.name,
                    localField: "sponsorAgent",
                    foreignField: "_id",
                    as: "sponsorAgent"
                }
            },
            {
                $unwind: {
                    path: "$sponsorAgent",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: userModel.collection.name,
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
            }
        ]);

        const options = {
            page,
            limit
        };

        const agents = await agentModel.aggregatePaginate(aggregate, options);

        return {
            status: true,
            statusCode: 200,
            agents
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

const editAgentQuery = async (details) => {
    try {
        const { _id, ...updateFields } = details;

        if (!_id) {
            return {
                status: false,
                statusCode: 400,
                message: "Agent _id is required."
            };
        }

        const restrictedFields = [
            "email",
            "passwordHash",
            "refreshToken",
            "isVerified",
            "agentId",
            "referralCode",
            "totalClients",
            "activeClients",
            "totalInvestmentVolume",
            "lifetimeBusinessVolume",
            "totalDeposits",
            "totalWithdrawals",
            "totalCommissionEarned",
            "totalCommissionPaid",
            "pendingCommission",
            "availableCommissionBalance",
            "lastCommissionPaidAt",
            "salaryActivated",
            "isSalaryEligibleThisMonth",
            "salesThisMonth",
            "createdBy",
            "updatedBy"
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

        const agent = await agentModel.findById(_id);

        if (!agent) {
            return {
                status: false,
                statusCode: 404,
                message: "Agent not found."
            };
        }

        const oldKycStatus = agent.kycStatus;
        const newKycStatus = sanitized.kycStatus;
        const oldStatus = agent.status;
        const newStatus = sanitized.status;

        // Auto-update fullName if firstName or lastName is updated
        if (sanitized.firstName !== undefined || sanitized.lastName !== undefined) {
            const currentFirstName = sanitized.firstName !== undefined ? sanitized.firstName : agent.firstName;
            const currentLastName = sanitized.lastName !== undefined ? sanitized.lastName : agent.lastName;
            sanitized.fullName = `${currentFirstName || ""} ${currentLastName || ""}`.trim();
        }

        const updatedAgent = await agentModel.findByIdAndUpdate(
            _id,
            { $set: sanitized },
            { new: true, runValidators: true }
        ).select("-passwordHash -refreshToken");

        // Send notifications based on changes
        try {
            if (newKycStatus && newKycStatus !== oldKycStatus) {
                const remarks = (sanitized.kycVerification && sanitized.kycVerification.remarks) || sanitized.notes || agent.notes || "No additional remarks.";
                if (newKycStatus === "approved") {
                    await sendNotificationMail({
                        to: agent.email,
                        subject: "Your Agent KYC Verification is Approved | Merlion Asset Holdings",
                        title: "KYC Verification Approved",
                        message: "Congratulations! Your agent identity verification documents have been successfully reviewed and approved. Your agent portal is now active.",
                        details: [
                            { label: "Agent ID", value: agent.agentId },
                            { label: "KYC Status", value: "Approved" },
                            { label: "Remarks / Notes", value: remarks }
                        ]
                    });
                } else if (newKycStatus === "rejected") {
                    await sendNotificationMail({
                        to: agent.email,
                        subject: "Action Required: Agent KYC Verification Rejected | Merlion Asset Holdings",
                        title: "KYC Verification Rejected",
                        message: "Your agent identity verification documents were reviewed and could not be approved at this time.",
                        details: [
                            { label: "Remarks / Reason", value: remarks },
                            { label: "Next Steps", value: "Please log in to your agent dashboard, review the remarks, and re-submit valid identity verification documents." }
                        ]
                    });
                }
            }

            if (newStatus && newStatus !== oldStatus) {
                let subject = "";
                let title = "";
                let message = "";
                if (newStatus === "active") {
                    subject = "Your Agent Account is Activated | Merlion Asset Holdings";
                    title = "Account Activated";
                    message = "Your Merlion Asset Holdings agent account is now active. You can log in and start using the agent console.";
                } else if (newStatus === "suspended") {
                    subject = "Your Agent Account has been Suspended | Merlion Asset Holdings";
                    title = "Account Suspended";
                    message = "Your Merlion Asset Holdings agent account has been suspended by administration. Please contact Relationship Manager support for details.";
                } else if (newStatus === "blocked") {
                    subject = "Your Agent Account has been Blocked | Merlion Asset Holdings";
                    title = "Account Blocked";
                    message = "Your Merlion Asset Holdings agent account has been blocked. If you believe this is an error, please reach out to admin support immediately.";
                } else if (newStatus === "closed") {
                    subject = "Your Agent Account is Closed | Merlion Asset Holdings";
                    title = "Account Closed";
                    message = "Your Merlion Asset Holdings agent account has been closed. We appreciate your partnership.";
                }

                if (subject) {
                    await sendNotificationMail({
                        to: agent.email,
                        subject,
                        title,
                        message,
                        details: [
                            { label: "Agent ID", value: agent.agentId },
                            { label: "Account Status", value: newStatus.charAt(0).toUpperCase() + newStatus.slice(1) }
                        ]
                    });
                }
            }
        } catch (notifError) {
            console.error("Failed to send status update email to agent:", notifError);
        }

        return {
            status: true,
            statusCode: 200,
            message: "Agent updated successfully.",
            agent: updatedAgent
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

const deleteAgentQuery = async (ids) => {
    try {
        ids = JSON.parse(ids);

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return {
                status: false,
                statusCode: 400,
                message: "Provide an array of agent ids"
            };
        }

        const inValidIds = ids.filter(id => !id.match(/^[0-9a-fA-F]{24}$/));

        if (inValidIds.length > 0) {
            return {
                status: false,
                statusCode: 400,
                message: "Invalid mongoDB ObjectId(s)",
                inValidIds
            };
        }

        const result = await agentModel.deleteMany({ _id: { $in: ids } });

        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} agent(s) deleted successfully`,
            deletedCount: result.deletedCount,
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};

const getAgentByIdQuery = async (id) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return { status: false, statusCode: 400, message: "Invalid agent id." };
        }

        const bankDetailModel = require("../models/bankDetail.model");
        const walletDetailModel = require("../models/walletDetail.model");

        await syncAgentStats(id);

        const agent = await agentModel.findById(id)
            .select("-passwordHash -refreshToken")
            .populate("sponsorAgent", "firstName lastName email agentId referralCode")
            .populate("kycVerification.verifiedBy", "firstName lastName email")
            .populate("createdBy", "firstName lastName email")
            .populate("updatedBy", "firstName lastName email")
            .lean();

        if (!agent) {
            return { status: false, statusCode: 404, message: "Agent not found." };
        }

        const [bankDetails, wallets] = await Promise.all([
            bankDetailModel.find({ userId: agent._id, userModel: "Agent" }).sort({ isPrimary: -1, createdAt: -1 }).lean(),
            walletDetailModel.find({ userId: agent._id, userModel: "Agent" }).sort({ isPrimary: -1, createdAt: -1 }).lean(),
        ]);

        return {
            status: true,
            statusCode: 200,
            data: { ...agent, bankDetails, wallets },
        };
    } catch (error) {
        console.error(error);
        return { status: false, statusCode: 500, message: error.message };
    }
};

const syncAgentStats = async (agentId) => {
    try {
        const clientModel = require("../models/client.model");
        const transactionModel = require("../models/transaction.model");
        const userWalletModel = require("../models/userWallet.model");
        const investmentPlanModel = require("../models/investmentsplans.model");

        if (!agentId) return;

        // Fetch Agent details to verify commission eligibility
        const agent = await agentModel.findById(agentId);
        if (!agent) return;

        // 1. totalClients & activeClients
        const totalClients = await clientModel.countDocuments({ agent: agentId });
        const activeClients = await clientModel.countDocuments({ agent: agentId, status: "active" });

        // 2. Find all clients referred by this agent
        const clients = await clientModel.find({ agent: agentId }).select("_id firstName lastName totalInvestedAmount");
        const clientIds = clients.map(c => c._id);

        // Calculate commissions & update agent wallet
        if (clientIds.length > 0 && agent.isCommissionEligible) {
            // Find completed investments chronologically
            const completedInvestments = await transactionModel.find({
                userId: { $in: clientIds },
                userModel: "Client",
                type: "investment",
                status: "completed"
            }).sort({ createdAt: 1 });

            for (let i = 0; i < completedInvestments.length; i++) {
                const investment = completedInvestments[i];

                // Check if commission already calculated for this investment
                const existingEarning = await transactionModel.findOne({
                    userId: agentId,
                    userModel: "Agent",
                    type: "earning",
                    referenceId: investment._id
                });

                if (!existingEarning) {
                    const clientObj = clients.find(c => c._id.toString() === investment.userId.toString());
                    const clientName = clientObj ? `${clientObj.firstName} ${clientObj.lastName}` : "Client";

                    const plan = await investmentPlanModel.findById(investment.referenceId);

                    let rate = 2; // Default starting rate
                    let isOneTime = false;

                    if (plan) {
                        if (plan.category === "lumpsum" || plan.category === "crypto") {
                            rate = 1;
                            isOneTime = true;
                        } else if (plan.category === "monthly") {
                            // SIP: determine tier based on completed investments prior to this one
                            const priorSalesCount = await transactionModel.countDocuments({
                                userId: { $in: clientIds },
                                userModel: "Client",
                                type: "investment",
                                status: "completed",
                                createdAt: { $lt: investment.createdAt }
                            });

                            if (priorSalesCount >= 20) {
                                rate = 10;
                            } else if (priorSalesCount >= 10) {
                                rate = 7;
                            } else if (priorSalesCount >= 5) {
                                rate = 5;
                            } else {
                                rate = 2;
                            }
                        }
                    }

                    const commissionAmount = Number((investment.amount * (rate / 100)).toFixed(2));

                    if (commissionAmount > 0) {
                        // Create earning transaction for agent
                        await transactionModel.create({
                            userId: agentId,
                            userModel: "Agent",
                            type: "earning",
                            amount: commissionAmount,
                            currency: investment.currency || "USD",
                            status: "completed",
                            referenceId: investment._id,
                            description: `Commission (${rate}% ${isOneTime ? "One-time" : "SIP"}) from client ${clientName} investment of ${investment.amount} ${investment.currency || "USD"}.`
                        });

                        // Credit agent wallet
                        await userWalletModel.findOneAndUpdate(
                            { userId: agentId, userModel: "Agent", currency: (investment.currency || "USD").toUpperCase() },
                            { $inc: { balance: commissionAmount } },
                            { upsert: true, new: true }
                        );
                    }
                }
            }
        }

        // Calculate total investment volume
        let totalInvestmentVolume = 0;
        let totalSalesLifetime = 0;
        if (clientIds.length > 0) {
            totalSalesLifetime = await transactionModel.countDocuments({
                userId: { $in: clientIds },
                userModel: "Client",
                type: "investment",
                status: "completed"
            });

            const investmentTx = await transactionModel.aggregate([
                {
                    $match: {
                        userId: { $in: clientIds },
                        userModel: "Client",
                        type: "investment",
                        status: "completed"
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: "$amount" }
                    }
                }
            ]);
            if (investmentTx && investmentTx[0]) {
                totalInvestmentVolume = investmentTx[0].total;
            } else {
                totalInvestmentVolume = clients.reduce((acc, c) => acc + (c.totalInvestedAmount || 0), 0);
            }
        }

        // 3. Agent's own deposits
        let totalDeposits = 0;
        const depositTx = await transactionModel.aggregate([
            {
                $match: {
                    userId: agentId,
                    userModel: "Agent",
                    type: "deposit",
                    status: "completed"
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" }
                }
            }
        ]);
        if (depositTx && depositTx[0]) {
            totalDeposits = depositTx[0].total;
        }

        // 4. Agent's own withdrawals
        let totalWithdrawals = 0;
        const withdrawalTx = await transactionModel.aggregate([
            {
                $match: {
                    userId: agentId,
                    userModel: "Agent",
                    type: "withdrawal",
                    status: "completed"
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" }
                }
            }
        ]);
        if (withdrawalTx && withdrawalTx[0]) {
            totalWithdrawals = withdrawalTx[0].total;
        }

        // 5. Commission earned
        let totalCommissionEarned = 0;
        const earningTx = await transactionModel.aggregate([
            {
                $match: {
                    userId: agentId,
                    userModel: "Agent",
                    type: "earning",
                    status: "completed"
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" }
                }
            }
        ]);
        if (earningTx && earningTx[0]) {
            totalCommissionEarned = earningTx[0].total;
        }

        // 6. Commission paid (payouts = withdrawals)
        let totalCommissionPaid = totalWithdrawals;

        // 7. Pending commission
        let pendingCommission = 0;
        const pendingEarningTx = await transactionModel.aggregate([
            {
                $match: {
                    userId: agentId,
                    userModel: "Agent",
                    type: "earning",
                    status: "pending"
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" }
                }
            }
        ]);
        if (pendingEarningTx && pendingEarningTx[0]) {
            pendingCommission = pendingEarningTx[0].total;
        }

        // 8. Available commission balance (from Agent's wallet)
        let availableCommissionBalance = 0;
        const agentWallet = await userWalletModel.findOne({ userId: agentId, userModel: "Agent" });
        if (agentWallet) {
            availableCommissionBalance = agentWallet.balance;
        } else {
            availableCommissionBalance = Math.max(0, totalCommissionEarned - totalCommissionPaid);
        }

        // Calculate current month's sales
        const startOfMonth = new Date();
        startOfMonth.setUTCDate(1);
        startOfMonth.setUTCHours(0, 0, 0, 0);

        let salesThisMonth = 0;
        if (clientIds.length > 0) {
            salesThisMonth = await transactionModel.countDocuments({
                userId: { $in: clientIds },
                userModel: "Client",
                type: "investment",
                status: "completed",
                createdAt: { $gte: startOfMonth }
            });
        }

        const salaryActivated = totalSalesLifetime >= 2;
        const isSalaryEligibleThisMonth = salaryActivated && (salesThisMonth >= 2);

        // Re-calculate agentLevel and commissionPercentage for SIP
        let agentLevel = "basic";
        let commissionPercentage = 2;

        if (totalSalesLifetime > 20) {
            agentLevel = "diamond";
            commissionPercentage = 10;
        } else if (totalSalesLifetime > 10) {
            agentLevel = "gold";
            commissionPercentage = 7;
        } else if (totalSalesLifetime > 5) {
            agentLevel = "silver";
            commissionPercentage = 5;
        } else {
            agentLevel = "basic";
            commissionPercentage = 2;
        }

        const lifetimeBusinessVolume = totalInvestmentVolume;

        await agentModel.updateOne(
            { _id: agentId },
            {
                $set: {
                    totalClients,
                    activeClients,
                    totalInvestmentVolume,
                    lifetimeBusinessVolume,
                    totalDeposits,
                    totalWithdrawals,
                    totalCommissionEarned,
                    totalCommissionPaid,
                    pendingCommission,
                    availableCommissionBalance,
                    salesThisMonth,
                    salaryActivated,
                    isSalaryEligibleThisMonth,
                    agentLevel,
                    commissionPercentage
                }
            }
        );
    } catch (err) {
        console.error("Failed to sync agent stats for agent ID:", agentId, err);
    }
};

const updateAgentProfileQuery = async (agentId, fields) => {
    try {
        // Only allow safe personal-info fields; all sensitive/system fields are blocked
        const ALLOWED_FIELDS = [
            "firstName", "lastName", "phoneNumber", "dateOfBirth",
            "gender", "country", "countryCode", "state", "city",
            "address", "postalCode", "preferredCurrency", "profileImage"
        ];

        const sanitized = Object.fromEntries(
            Object.entries(fields).filter(([k]) => ALLOWED_FIELDS.includes(k))
        );

        if (Object.keys(sanitized).length === 0) {
            return { status: false, statusCode: 400, message: "No valid fields provided to update." };
        }

        // Auto-rebuild fullName whenever name parts change
        const agent = await agentModel.findById(agentId).lean();
        if (!agent) {
            return { status: false, statusCode: 404, message: "Agent not found." };
        }

        if (sanitized.firstName !== undefined || sanitized.lastName !== undefined) {
            const first = sanitized.firstName !== undefined ? sanitized.firstName : agent.firstName;
            const last  = sanitized.lastName  !== undefined ? sanitized.lastName  : agent.lastName;
            sanitized.fullName = `${first || ""} ${last || ""}`.trim();
        }

        const updated = await agentModel.findByIdAndUpdate(
            agentId,
            { $set: sanitized },
            { new: true, runValidators: true }
        ).select("-passwordHash -refreshToken");

        return {
            status: true,
            statusCode: 200,
            message: "Profile updated successfully.",
            agent: updated
        };
    } catch (error) {
        return { status: false, statusCode: 500, message: error.message };
    }
};

module.exports = {
    syncAgentStats,
    authQuery,
    signUpQuery,
    createAgentByAdminQuery,
    verifyOtpQuery,
    resendOtpQuery,
    forgotPasswordQuery,
    submitKycQuery,
    approveKycQuery,
    agentListQuery,
    editAgentQuery,
    deleteAgentQuery,
    getAgentByIdQuery,
    updateAgentProfileQuery
};
