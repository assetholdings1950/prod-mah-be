const mongoose = require("mongoose");

const criterionSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        label: { type: String, required: true },
        weight: { type: Number, required: true, min: 0, max: 100 },
        score: { type: Number, required: true, min: 1, max: 5 },
    },
    { _id: false },
);

const candidateEvaluationSchema = new mongoose.Schema(
    {
        application: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "HiringApplication",
            required: true,
            unique: true,
            index: true,
        },
        criteria: { type: [criterionSchema], required: true },
        weightedScore: { type: Number, required: true, min: 1, max: 5 },
        evidence: { type: String, required: true, maxlength: 10000 },
        strengths: { type: String, required: true, maxlength: 10000 },
        concerns: { type: String, default: "", maxlength: 10000 },
        recommendation: {
            type: String,
            enum: ["Strong recommendation", "Consider", "Hold", "Reject"],
            required: true,
        },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true },
);

candidateEvaluationSchema.pre("validate", function calculateWeightedScore(next) {
    const totalWeight = (this.criteria || []).reduce(
        (total, criterion) => total + Number(criterion.weight || 0),
        0,
    );
    if (totalWeight !== 100) {
        return next(new Error("Evaluation criterion weights must total 100"));
    }
    this.weightedScore = this.criteria.reduce(
        (total, criterion) =>
            total + Number(criterion.score) * (Number(criterion.weight) / 100),
        0,
    );
    next();
});

module.exports = mongoose.model("CandidateEvaluation", candidateEvaluationSchema);
