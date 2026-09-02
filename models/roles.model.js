const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
    {
        roleName: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        roleCode: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        contents: {
            type: [String],
            default: [],
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId, ref: "User", required: true
        }
    },
    { timestamps: true }
);

/**
 * Auto-generate roleCode from roleName
 * Example:
 * "Super Admin" -> "superadmin"
 * "Content-Editor!" -> "contenteditor"
 */
roleSchema.pre("validate", function (next) {
    if (this.roleName && !this.roleCode) {
        this.roleCode = this.roleName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ""); // remove special chars & spaces
    }
    next();
});

module.exports = mongoose.model("Role", roleSchema);
