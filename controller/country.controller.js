const Country = require("../models/country.model");

/** GET /countries  — list all countries with name, code, dialCode, cities */
const listCountriesController = async (req, res, next) => {
    try {
        const { search } = req.query;
        const filter = search
            ? { name: { $regex: search.trim(), $options: "i" } }
            : {};

        const countries = await Country.find(filter)
            .select("name code dialCode cities isCustom")
            .sort({ name: 1 })
            .lean();

        return res.json({ status: true, data: countries });
    } catch (err) {
        next(err);
    }
};

/** GET /countries/cities?country=Singapore  — get cities for one country */
const getCitiesController = async (req, res, next) => {
    try {
        const { country } = req.query;
        if (!country) {
            return res.status(400).json({ status: false, message: "country query param is required." });
        }

        const doc = await Country.findOne({ name: country.trim() }).select("cities").lean();
        return res.json({ status: true, cities: doc?.cities ?? [] });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    listCountriesController,
    getCitiesController,
};
