const mongoose = require("mongoose");
const investmentPlanModel = require("../models/investmentsplans.model");
const slugify = require("slugify");


const createInvestmentPlanQuery = async (details) => {
    try {
        const {
            name,
            shortDescription,
            description,
            photourl,
            category,
            minAmount,
            maxAmount,
            currency,
            roiType,
            roiMin,
            roiMax,
            roiPeriod,
            payoutType,
            durationMinMonths,
            durationMaxMonths,
            lockInMonths,
            exitPenaltyPercent,
            riskLevel,
            termsAndConditions,
            status,
            featured,
            sortOrder,
            createdBy
        } = details;

        // ===========================
        // GENERATE SLUG
        // ===========================

        let slug = slugify(name, { lower: true, strict: true });

        const existingSlug = await investmentPlanModel.findOne({ slug });

        if (existingSlug) {
            slug = `${slug}-${Date.now()}`;
        }

        // ===========================
        // CREATE INVESTMENT PLAN
        // ===========================

        const newPlan = await investmentPlanModel.create({
            name,
            slug,
            shortDescription,
            description,
            photourl,
            category,
            minAmount,
            maxAmount,
            currency,
            roiType,
            roiMin,
            roiMax: roiType === "range" ? roiMax : null,
            roiPeriod,
            payoutType,
            durationMinMonths,
            durationMaxMonths,
            lockInMonths,
            exitPenaltyPercent,
            riskLevel,
            termsAndConditions,
            status: status || "draft",
            featured: featured || false,
            sortOrder: sortOrder || 0,
            createdBy: createdBy || null
        });

        // ===========================
        // RESPONSE
        // ===========================

        return {
            status: true,
            statusCode: 200,
            message: "Investment plan created successfully.",
            plan: newPlan
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


const investmentPlanListQuery = async ({ page = 1, limit = 10, search, category, status, riskLevel, featured }) => {
    try {
        let matchQuery = {};

        if (search && search.trim()) {
            matchQuery.$or = [
                { name: { $regex: search, $options: "i" } },
                { slug: { $regex: search, $options: "i" } },
                { shortDescription: { $regex: search, $options: "i" } }
            ];
        }

        if (category) matchQuery.category = category;
        if (status) matchQuery.status = status;
        if (riskLevel) matchQuery.riskLevel = riskLevel;
        if (featured !== undefined) matchQuery.featured = featured === "true";

        const aggregate = investmentPlanModel.aggregate([
            {
                $match: matchQuery
            },

            // CREATED BY LOOKUP
            {
                $lookup: {
                    from: "users",
                    let: { createdById: "$createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$_id", "$$createdById"] }
                            }
                        },
                        {
                            $project: {
                                passwordHash: 0,
                                refreshToken: 0,
                                otpCode: 0,
                                otpExpires: 0
                            }
                        }
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

            {
                $project: {
                    createdByUser: 0
                }
            },

            {
                $sort: { sortOrder: 1, createdAt: -1 }
            }
        ]);

        const options = {
            page,
            limit
        };

        const plans = await investmentPlanModel.aggregatePaginate(aggregate, options);

        return {
            status: true,
            statusCode: 200,
            plans
        };

    } catch (error) {
        return {
            status: false,
            statusCode: 500,
            message: error.message
        };
    }
};


const editInvestmentPlanQuery = async (details) => {
    try {
        const { _id, ...updateFields } = details;

        if (!_id) {
            return {
                status: false,
                statusCode: 400,
                message: "Investment plan _id is required."
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

        const plan = await investmentPlanModel.findById(_id);

        if (!plan) {
            return {
                status: false,
                statusCode: 404,
                message: "Investment plan not found."
            };
        }

        const updatedPlan = await investmentPlanModel.findByIdAndUpdate(
            _id,
            { $set: sanitized },
            { new: true, runValidators: true }
        );

        return {
            status: true,
            statusCode: 200,
            message: "Investment plan updated successfully.",
            plan: updatedPlan
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


const getInvestmentPlanByIdQuery = async (id) => {
    try {
        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
            return {
                status: false,
                statusCode: 400,
                message: "Invalid investment plan id."
            };
        }

        const [plan] = await investmentPlanModel.aggregate([
            {
                $match: { _id: mongoose.Types.ObjectId.createFromHexString(id) }
            },

            // CREATED BY LOOKUP
            {
                $lookup: {
                    from: "users",
                    let: { createdById: "$createdBy" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$_id", "$$createdById"] }
                            }
                        },
                        {
                            $project: {
                                passwordHash: 0,
                                refreshToken: 0,
                                otpCode: 0,
                                otpExpires: 0
                            }
                        }
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

            {
                $project: {
                    createdByUser: 0
                }
            }
        ]);

        if (!plan) {
            return {
                status: false,
                statusCode: 404,
                message: "Investment plan not found."
            };
        }

        return {
            status: true,
            statusCode: 200,
            plan
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


const deleteInvestmentPlanQuery = async (ids) => {
    try {
        ids = JSON.parse(ids);

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return {
                status: false,
                statusCode: 400,
                message: "Provide an array of investment plan ids."
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

        const result = await investmentPlanModel.deleteMany({ _id: { $in: ids } });

        return {
            status: true,
            statusCode: 200,
            message: `${result.deletedCount} investment plan(s) deleted successfully.`,
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


module.exports = {
    createInvestmentPlanQuery,
    investmentPlanListQuery,
    getInvestmentPlanByIdQuery,
    editInvestmentPlanQuery,
    deleteInvestmentPlanQuery
};