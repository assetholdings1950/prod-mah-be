const mongoose = require("mongoose");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const mongoosePaginate = require("mongoose-paginate-v2");

const agentSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },

    passwordHash: {
        type: String,
        required: true
    },

    refreshToken: {
        type: String,
        default: null
    },

    isVerified: {
        type: Boolean,
        default: false
    },

    otpCode: {
        type: String,
        default: null
    },

    otpExpires: {
        type: Date,
        default: null
    },

    agentId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    referralCode: {
        type: String,
        default: undefined,
        trim: true,
        uppercase: true
    },

    fullName: {
        type: String,
        default: null
    },

    firstName: {
        type: String,
        default: null
    },

    lastName: {
        type: String,
        default: null
    },

    dateOfBirth: {
        type: Date,
        default: null
    },

    gender: {
        type: String,
        enum: ["male", "female", "other"],
        default: null
    },

    profileImage: {
        type: String,
        default: null
    },

    country: {
        type: String,
        default: null
    },

    countryCode: {
        type: String,
        default: null
    },

    state: {
        type: String,
        default: null
    },

    city: {
        type: String,
        default: null
    },

    address: {
        type: String,
        default: null
    },

    postalCode: {
        type: String,
        default: null
    },

    phoneNumber: {
        type: String,
        default: null
    },

    agentLevel: {
        type: String,
        enum: ["basic", "silver", "gold", "diamond"],
        default: "basic"
    },

    salaryActivated: {
        type: Boolean,
        default: false
    },

    isSalaryEligibleThisMonth: {
        type: Boolean,
        default: false
    },

    salesThisMonth: {
        type: Number,
        default: 0
    },

    commissionPercentage: {
        type: Number,
        default: 2
    },

    preferredCurrency: {
        type: String,
        default: "USD"
    },

    isCommissionEligible: {
        type: Boolean,
        default: true
    },

    joiningDate: {
        type: Date,
        default: Date.now
    },

    sponsorAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null
    },

    kycStatus: {
        type: String,
        enum: [
            "pending",
            "under_review",
            "approved",
            "rejected"
        ],
        default: "pending"
    },

    kycVerification: {
        liveSelfie: {
            type: String,
            default: null
        },

        selfDeclarationVideo: {
            type: String,
            default: null
        },

        governmentIdType: {
            type: String,
            // Display strings, matching the mobile app dropdown and the Client
            // model enum so the same values persist across both user types.
            enum: [
                "Passport",
                "National Id",
                "Driving License",
                "Voter Id",
                "Aadhar",
                "PAN",
                "Other"
            ],
            default: null
        },

        governmentIdNumber: {
            type: String,
            default: null
        },

        governmentIdFront: {
            type: String,
            default: null
        },

        governmentIdBack: {
            type: String,
            default: null
        },

        remarks: {
            type: String,
            default: null
        },

        submittedAt: {
            type: Date,
            default: null
        },

        verifiedAt: {
            type: Date,
            default: null
        },

        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        }
    },

    totalClients: {
        type: Number,
        default: 0
    },

    activeClients: {
        type: Number,
        default: 0
    },

    referredClients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client"
    }],

    totalInvestmentVolume: {
        type: Number,
        default: 0
    },

    lifetimeBusinessVolume: {
        type: Number,
        default: 0
    },

    totalDeposits: {
        type: Number,
        default: 0
    },

    totalWithdrawals: {
        type: Number,
        default: 0
    },

    totalCommissionEarned: {
        type: Number,
        default: 0
    },

    totalCommissionPaid: {
        type: Number,
        default: 0
    },

    pendingCommission: {
        type: Number,
        default: 0
    },

    availableCommissionBalance: {
        type: Number,
        default: 0
    },

    lastCommissionPaidAt: {
        type: Date,
        default: null
    },

    isKycRequired: {
        type: Boolean,
        default: true
    },

    isProfileCompleted: {
        type: Boolean,
        default: false
    },

    notes: {
        type: String,
        default: null
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    status: {
        type: String,
        enum: [
            "pending",
            "active",
            "inactive",
            "suspended",
            "blocked",
            "closed"
        ],
        default: "pending"
    }

}, {
    timestamps: true
});

agentSchema.plugin(aggregatePaginate);
agentSchema.plugin(mongoosePaginate);

// Every agent receives a unique referral code, regardless of how the account is created.
agentSchema.index({ referralCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Agent", agentSchema);
