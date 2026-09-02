const mongoose = require("mongoose");

const sipInstallmentEventSchema = new mongoose.Schema(
    {
        portfolioId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClientPortfolio",
            required: true,
            index: true,
        },
        portfolioCode: { type: String, required: true, trim: true, index: true },
        clientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Client",
            required: true,
            index: true,
        },
        eventType: {
            type: String,
            enum: ["auto_paid", "manual_paid", "missed", "processing_error"],
            required: true,
            index: true,
        },
        installmentNo: { type: Number, required: true, min: 1 },
        amountUsd: { type: Number, required: true, min: 0 },
        paymentCurrency: { type: String, trim: true, uppercase: true, default: null },
        paidAmount: { type: Number, default: null },
        rate: { type: Number, default: null },
        rateSource: { type: String, trim: true, default: null },
        dueDate: { type: Date, default: null },
        recoveredMissed: { type: Boolean, default: false, index: true },
        resolvedAt: { type: Date, default: null },
        reason: { type: String, trim: true, default: null },
        walletsChecked: { type: Number, default: 0 },
        transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null },
    },
    { timestamps: true, versionKey: false }
);

sipInstallmentEventSchema.index({ createdAt: -1, eventType: 1 });
sipInstallmentEventSchema.index({ portfolioId: 1, eventType: 1, resolvedAt: 1 });
sipInstallmentEventSchema.index({ clientId: 1, createdAt: -1 });

module.exports = mongoose.models.SipInstallmentEvent
    || mongoose.model("SipInstallmentEvent", sipInstallmentEventSchema);
