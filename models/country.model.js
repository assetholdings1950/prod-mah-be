const mongoose = require("mongoose");

const countrySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        dialCode: {
            type: String,
            required: true,
            trim: true,
        },
        cities: [
            {
                type: String,
                trim: true,
            },
        ],
        isCustom: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

countrySchema.index({ name: "text" });

const Country =
    mongoose.models.Country || mongoose.model("Country", countrySchema);

module.exports = Country;
