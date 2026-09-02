const { default: mongoose } = require("mongoose");
const { default: newsModel } = require("../models/newsModel/news.model");
const publisherModel = require("../models/publisher.model");


const MONGO_URI = "mongodb+srv://sumangal_db_user:cwLb66XV6CjgOIir@cluster0.ljbwqus.mongodb.net/"

const updatePublisher = async () => {
    try {

        const result = await publisherModel.updateMany(
            {}, // match ALL news documents
            {
                $set: {
                    topGEO: [],
                    niches: []
                },
            }
        );

        return {
            status: true,
            statusCode: 200,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            message: "All publisher documents updated with createdBy",
        };


    } catch (err) {
        return {
            status: false,
            statusCode: 500,
            message: err.message
        }
    }
}

// 🧩 Run Migration
const runMigration = async () => {
    try {
        console.log("🔗 Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB connected.");

        const result = await updatePublisher();
        console.log(result);

        console.log("🔒 Closing MongoDB connection...");
        await mongoose.connection.close();
        console.log("✅ Migration finished successfully.");
    } catch (err) {
        console.error("❌ Migration failed:", err);
        await mongoose.connection.close();
    }
};

runMigration();