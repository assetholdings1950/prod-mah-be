import mongoose from "mongoose";
import fs from "fs";
import newsModel from "../models/newsModel/news.model.js";

const env = "mongodb+srv://developmentteam_db_user:IDyMveM5483GEMaX@cluster0.kkzrftu.mongodb.net/"

const MONGO_URI = process.env.MONGO_URL || env;

const exportCollection = async () => {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const news = await newsModel.find().lean();
    fs.writeFileSync("./prod_news_data.json", JSON.stringify(news, null, 2));

    console.log(`📦 Exported ${news.length} news items`);
    mongoose.connection.close();
};

exportCollection();
