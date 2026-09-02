const mongoose = require("mongoose");
const slugify = require("slugify");
const paymentMethodModel = require("../models/paymentMethod.model");


const createPaymentMethodQuery = async (details) => {
    try {
        const {
            name, type, currency, network,
            walletAddress, accountDetails, qrCodeUrl, instructions,
            minDeposit, maxDeposit, processingTime,
            status, sortOrder, createdBy
        } = details;

        if (!name || !type || !currency || !network) {
            return {
                status: false,
                statusCode: 400,
                message: "name, type, currency, and network are required."
            };
        }

        let slug = slugify(name, { lower: true, strict: true });
        const existingSlug = await paymentMethodModel.findOne({ slug });
        if (existingSlug) {
            slug = `${slug}-${Date.now()}`;
        }

        const newMethod = await paymentMethodModel.create({
            name,
            slug,
            type,
            currency,
            network,
            walletAddress: walletAddress || "",
            accountDetails: accountDetails || "",
            qrCodeUrl: qrCodeUrl || "",
            instructions: instructions || "",
            minDeposit: minDeposit ?? 0,
            maxDeposit: maxDeposit ?? null,
            processingTime: processingTime || "",
            status: status || "inactive",
            sortOrder: sortOrder || 0,
            createdBy: createdBy || null
        });

        return {
            status: true,
            statusCode: 200,
            message: "Payment method created successfully.",
            paymentMethod: newMethod
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


const paymentMethodListQuery = async ({ page = 1, limit = 10, search, type, status }) => {
    try {
        let matchQuery = {};

        if (search && search.trim()) {
            matchQuery.$or = [
                { name: { $regex: search, $options: "i" } },
                { slug: { $regex: search, $options: "i" } }
            ];
        }

        if (type) matchQuery.type = type;
        if (status) matchQuery.status = status;

        const aggregate = paymentMethodModel.aggregate([
            { $match: matchQuery },
            {
                $lookup: {
                    from: "users",
                    let: { createdById: "$createdBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$createdById"] } } },
                        { $project: { passwordHash: 0, refreshToken: 0, otpCode: 0, otpExpires: 0 } }
                    ],
                    as: "createdByUser"
                }
            },
            {
                $addFields: {
                    createdBy: {
                        $cond: {
                            if: { $gt: [{ $size: "$createdByUser" }, 0] },
                            then: { $arrayElemAt: ["$createdByUser", 0] },
                            else: "$createdBy"
                        }
                    }
                }
            },
            { $project: { createdByUser: 0 } },
            { $sort: { sortOrder: 1, createdAt: -1 } }
        ]);

        const options = { page, limit };
        const paymentMethods = await paymentMethodModel.aggregatePaginate(aggregate, options);

        return {
            status: true,
            statusCode: 200,
            paymentMethods
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};


const getPaymentMethodByIdQuery = async (id) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return {
                status: false,
                statusCode: 400,
                message: "Invalid payment method id."
            };
        }

        const [paymentMethod] = await paymentMethodModel.aggregate([
            { $match: { _id: mongoose.Types.ObjectId.createFromHexString(id) } },
            {
                $lookup: {
                    from: "users",
                    let: { createdById: "$createdBy" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$createdById"] } } },
                        { $project: { passwordHash: 0, refreshToken: 0, otpCode: 0, otpExpires: 0 } }
                    ],
                    as: "createdByUser"
                }
            },
            {
                $addFields: {
                    createdBy: {
                        $cond: {
                            if: { $gt: [{ $size: "$createdByUser" }, 0] },
                            then: { $arrayElemAt: ["$createdByUser", 0] },
                            else: "$createdBy"
                        }
                    }
                }
            },
            { $project: { createdByUser: 0 } }
        ]);

        if (!paymentMethod) {
            return {
                status: false,
                statusCode: 404,
                message: "Payment method not found."
            };
        }

        return {
            status: true,
            statusCode: 200,
            paymentMethod
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


const activePaymentMethodsQuery = async () => {
    try {
        const paymentMethods = await paymentMethodModel
            .find({ status: "active" })
            .select("-createdBy -updatedBy")
            .sort({ sortOrder: 1, createdAt: -1 });

        return {
            status: true,
            statusCode: 200,
            paymentMethods
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};


const editPaymentMethodQuery = async (details) => {
    try {
        const { _id, ...updateFields } = details;

        if (!_id) {
            return {
                status: false,
                statusCode: 400,
                message: "Payment method _id is required."
            };
        }

        const restrictedFields = ["slug", "createdBy", "createdAt"];
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

        const existing = await paymentMethodModel.findById(_id);
        if (!existing) {
            return {
                status: false,
                statusCode: 404,
                message: "Payment method not found."
            };
        }

        const updated = await paymentMethodModel.findByIdAndUpdate(
            _id,
            { $set: sanitized },
            { new: true, runValidators: true }
        );

        return {
            status: true,
            statusCode: 200,
            message: "Payment method updated successfully.",
            paymentMethod: updated
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


const deletePaymentMethodQuery = async (ids) => {
    try {
        ids = JSON.parse(ids);

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return {
                status: false,
                statusCode: 400,
                message: "Provide an array of payment method ids."
            };
        }

        const invalidIds = ids.filter(id => !id.match(/^[0-9a-fA-F]{24}$/));
        if (invalidIds.length > 0) {
            return {
                status: false,
                statusCode: 400,
                message: "Invalid mongoDB ObjectId(s)",
                invalidIds
            };
        }

        const result = await paymentMethodModel.deleteMany({ _id: { $in: ids } });

        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} payment method(s) deleted successfully.`,
            deletedCount: result.deletedCount
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};


const togglePaymentMethodStatusQuery = async ({ _id, updatedBy }) => {
    try {
        if (!_id || !_id.match(/^[0-9a-fA-F]{24}$/)) {
            return {
                status: false,
                statusCode: 400,
                message: "Invalid payment method id."
            };
        }

        const existing = await paymentMethodModel.findById(_id);
        if (!existing) {
            return {
                status: false,
                statusCode: 404,
                message: "Payment method not found."
            };
        }

        const newStatus = existing.status === "active" ? "inactive" : "active";

        const updated = await paymentMethodModel.findByIdAndUpdate(
            _id,
            { $set: { status: newStatus, updatedBy: updatedBy || null } },
            { new: true }
        );

        return {
            status: true,
            statusCode: 200,
            message: `Payment method ${newStatus === "active" ? "activated" : "deactivated"} successfully.`,
            paymentMethod: updated
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


module.exports = {
    createPaymentMethodQuery,
    paymentMethodListQuery,
    getPaymentMethodByIdQuery,
    activePaymentMethodsQuery,
    editPaymentMethodQuery,
    deletePaymentMethodQuery,
    togglePaymentMethodStatusQuery
};
