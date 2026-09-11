require("dotenv").config();
const mongoose = require("mongoose");
const { configureDns } = require("../connections/mongo.connection");
const ClientPortfolio = require("../models/clientPortfolio.model");

const PORTFOLIO_ID = "6a4c9fb5fba39fb23058bcbc";

const START      = new Date("2026-06-07T12:30:00.000Z");
const MATURITY   = new Date("2027-06-07T12:30:00.000Z");
const NEXT_DUE   = new Date("2026-07-07T12:30:00.000Z"); // 1 month after start

async function run() {
    configureDns();
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB");

    const result = await ClientPortfolio.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(PORTFOLIO_ID) },
        {
            $set: {
                startedAt:                   START,
                maturityDate:                MATURITY,
                lockInEndDate:               MATURITY,
                createdAt:                   START,
                updatedAt:                   START,

                "paidFromWallet.convertedAt": START,
                "paidFromWallet.lockedAt":    START,
                "paidFromWallet.lockedUntil": new Date(START.getTime() + 10 * 60 * 1000),

                "sip.lastPaidDate":  START,
                "sip.nextDueDate":   NEXT_DUE,

                "lots.0.investedAt":    START,
                "lots.0.maturityDate":  MATURITY,
            },
        }
    );

    console.log("Matched:", result.matchedCount, "| Modified:", result.modifiedCount);
    console.log("startedAt  →", START.toISOString());
    console.log("maturityDate →", MATURITY.toISOString());
    console.log("nextDueDate  →", NEXT_DUE.toISOString());

    await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
