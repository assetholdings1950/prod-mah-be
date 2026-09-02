const mongoose = require("mongoose");

const consultantRequestSchema = new mongoose.Schema(
    {
        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Client",
            required: false,
        },
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            trim: true,
            lowercase: true,
        },
        phone: {
            type: String,
            trim: true,
            default: "",
        },
        preferredContactMethod: {
            type: String,
            enum: ["Email", "Phone", "WhatsApp", "Video Call"],
            default: "Email",
        },
        preferredTime: {
            type: String,
            default: "Flexible",
        },
        topic: {
            type: String,
            default: "General Wealth Advisory",
        },
        investmentRange: {
            type: String,
            default: "Not Specified",
        },
        riskTolerance: {
            type: String,
            default: "Balanced",
        },
        investmentHorizon: {
            type: String,
            default: "Medium Term (1-3 Years)",
        },
        portfolioSnapshot: {
            deployedCapital: { type: Number, default: 0 },
            walletBalance: { type: Number, default: 0 },
            activePortfolios: { type: Number, default: 0 },
        },
        query: {
            type: String,
            required: [true, "Query message is required"],
            trim: true,
        },
        status: {
            type: String,
            enum: ["Pending", "In Review", "Contacted", "Resolved", "Closed"],
            default: "Pending",
        },
        assignedAdvisor: {
            type: String,
            default: "Senior Wealth Specialist",
        },
        adminNotes: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("ConsultantRequest", consultantRequestSchema);
