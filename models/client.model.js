const mongoose = require("mongoose");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const mongoosePaginate = require("mongoose-paginate-v2");

const clientSchema = new mongoose.Schema({

    // Authentication
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

    // Client Identity
    clientId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Referral/commission agent relationship
    agent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
        index: true
    },

    // Advisory/support relationship. This is deliberately separate from
    // `agent`, which remains the referral and commission owner.
    accountManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent",
        default: null,
        index: true
    },

    accountManagerAssignedAt: {
        type: Date,
        default: null
    },

    accountManagerAssignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    registeredByAgent: {
        type: Boolean,
        default: false
    },

    referralCode: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
        default: null
    },

    referredClients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client"
    }],

    totalClients: {
        type: Number,
        default: 0
    },

    // Personal Information
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
        type: String,
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

    phoneNumber: {
        type: String,
        default: null
    },

    nationality: {
        type: String,
        default: null
    },

    // Address
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

    // Investment Preferences
    preferredCurrency: {
        type: String,
        default: "USD"
    },

    riskProfile: {
        type: String,
        enum: [
            "conservative",
            "moderate",
            "aggressive"
        ],
        default: "moderate"
    },

    // KYC
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

    // Bank details and wallets are stored in separate BankDetail and WalletDetail collections
    // referenced by userId + userModel = "Client"

    // Investment Statistics
    totalInvestments: {
        type: Number,
        default: 0
    },

    activeInvestments: {
        type: Number,
        default: 0
    },

    completedInvestments: {
        type: Number,
        default: 0
    },

    totalInvestedAmount: {
        type: Number,
        default: 0
    },

    activeInvestmentAmount: {
        type: Number,
        default: 0
    },

    portfolioValue: {
        type: Number,
        default: 0
    },

    totalProfitEarned: {
        type: Number,
        default: 0
    },

    totalInterestEarned: {
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

    availableBalance: {
        type: Number,
        default: 0
    },

    // Account Flags
    isKycRequired: {
        type: Boolean,
        default: true
    },

    isProfileCompleted: {
        type: Boolean,
        default: false
    },

    accountForm: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AccountOpeningForm",
        default: null
    },

    // Administration
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

clientSchema.plugin(aggregatePaginate);
clientSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Client", clientSchema);
