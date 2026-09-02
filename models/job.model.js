const mongoose = require("mongoose");
const aggregatePaginate = require("mongoose-aggregate-paginate-v2");
const mongoosePaginate = require("mongoose-paginate-v2");

const hasRichTextContent = (value) =>
    typeof value === "string" &&
    value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().length > 0;

const jobSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        validate: {
            validator: hasRichTextContent,
            message: "Description must contain visible content"
        }
    },
    location: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ["Full-time", "Part-time", "Contract", "Internship"],
        default: "Full-time"
    },
    status: {
        type: String,
        enum: ["Active", "Closed"],
        default: "Active"
    },
    closingDate: { type: Date, default: null }
}, {
    timestamps: true
});

jobSchema.plugin(mongoosePaginate);
jobSchema.plugin(aggregatePaginate);

module.exports = mongoose.model("Job", jobSchema);
