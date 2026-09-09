const mongoose = require("mongoose");
const slugify = require("slugify");
const bondModel = require("../models/bond.model");
const bondCounterModel = require("../models/bondCounter.model");

const nextBondCode = async () => {
    const counter = await bondCounterModel.findOneAndUpdate(
        { key: "bond" },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return `BND-${String(counter.value).padStart(6, "0")}`;
};

const normalizeOptionalNumbers = (details) => {
    const optional = [
        "maxInvestment", "usdtLockMonths",
        "usdtPartialForfeitPercent", "paidCouponClawbackPercent",
    ];
    const normalized = { ...details };
    optional.forEach((key) => {
        if (normalized[key] === "" || normalized[key] === undefined) normalized[key] = null;
    });
    if (normalized.usdtLockType === "same_as_bond") normalized.usdtLockMonths = null;
    if (normalized.usdtBenefitEnabled === false) {
        normalized.usdtBenefitPercent = 0;
        normalized.usdtLockMonths = null;
    }
    if (normalized.usdtEarlyExitTreatment !== "partial_forfeit") normalized.usdtPartialForfeitPercent = null;
    if (normalized.paidCouponTreatment !== "partial_clawback") normalized.paidCouponClawbackPercent = null;
    return normalized;
};

const createBondQuery = async (details) => {
    const payload = normalizeOptionalNumbers(details);
    payload.name = String(payload.name || "").trim();
    delete payload.code;
    payload.slug = slugify(payload.slug || payload.name, { lower: true, strict: true });

    if (!payload.name || !payload.slug) {
        return { status: false, statusCode: 400, message: "Bond name is required." };
    }

    const duplicate = await bondModel.findOne({ slug: payload.slug }).lean();
    if (duplicate) {
        return { status: false, statusCode: 409, message: "A bond with this slug already exists." };
    }

    payload.code = await nextBondCode();
    const bond = await bondModel.create(payload);
    return { status: true, statusCode: 201, message: "Bond created successfully.", bond };
};

const listBondsQuery = async ({ page = 1, limit = 12, search = "", status, riskLevel, couponFrequency }) => {
    const match = {};
    if (search.trim()) {
        match.$or = ["name", "code", "slug", "shortDescription"].map((field) => ({
            [field]: { $regex: search.trim(), $options: "i" },
        }));
    }
    if (status) match.status = status;
    if (riskLevel) match.riskLevel = riskLevel;
    if (couponFrequency) match.couponFrequency = couponFrequency;

    const bonds = await bondModel.paginate(match, {
        page,
        limit,
        sort: { sortOrder: 1, createdAt: -1 },
        lean: true,
    });
    return { status: true, statusCode: 200, bonds };
};

const getBondByIdQuery = async (id) => {
    if (!mongoose.isValidObjectId(id)) {
        return { status: false, statusCode: 400, message: "Invalid bond id." };
    }
    const bond = await bondModel.findById(id).lean();
    if (!bond) return { status: false, statusCode: 404, message: "Bond not found." };
    return { status: true, statusCode: 200, bond };
};

const updateBondQuery = async (details) => {
    const { _id, ...fields } = normalizeOptionalNumbers(details);
    if (!mongoose.isValidObjectId(_id)) {
        return { status: false, statusCode: 400, message: "A valid bond id is required." };
    }

    delete fields.createdBy;
    delete fields.createdAt;
    delete fields.version;
    delete fields.code;
    if (fields.name) fields.name = String(fields.name).trim();
    if (fields.slug) fields.slug = slugify(fields.slug, { lower: true, strict: true });

    const duplicateConditions = [];
    if (fields.slug) duplicateConditions.push({ slug: fields.slug });
    if (duplicateConditions.length) {
        const duplicate = await bondModel.findOne({ _id: { $ne: _id }, $or: duplicateConditions }).lean();
        if (duplicate) return { status: false, statusCode: 409, message: "A bond with this slug already exists." };
    }

    const bond = await bondModel.findById(_id);
    if (!bond) return { status: false, statusCode: 404, message: "Bond not found." };
    Object.assign(bond, fields);
    bond.version += 1;
    await bond.save();
    return { status: true, statusCode: 200, message: "Bond updated successfully.", bond };
};

const deleteBondsQuery = async (rawIds) => {
    let ids;
    try { ids = JSON.parse(rawIds || "[]"); } catch { ids = []; }
    if (!Array.isArray(ids) || !ids.length || ids.some((id) => !mongoose.isValidObjectId(id))) {
        return { status: false, statusCode: 400, message: "Provide valid bond ids." };
    }
    const bonds = await bondModel.find({ _id: { $in: ids } }).select("status").lean();
    if (bonds.length !== ids.length) return { status: false, statusCode: 404, message: "One or more bonds were not found." };
    if (bonds.some((bond) => bond.status !== "draft")) {
        return { status: false, statusCode: 409, message: "Only draft bonds can be deleted. Archive published bonds instead." };
    }
    const result = await bondModel.deleteMany({ _id: { $in: ids } });
    return { status: true, statusCode: 200, message: "Bond(s) deleted successfully.", deletedCount: result.deletedCount };
};

module.exports = { createBondQuery, listBondsQuery, getBondByIdQuery, updateBondQuery, deleteBondsQuery };
