const mongoose = require('mongoose')

async function connectDatabase() {
    if (!process.env.DATABASE) {
        throw new Error("DATABASE must be configured")
    }

    try {
        await mongoose.connect(process.env.DATABASE, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 10000
        })
        console.log("MongoDB connected")
    } catch (error) {
        if (["ECONNREFUSED", "ETIMEOUT", "ENOTFOUND"].includes(error.code)) {
            console.error(
                "MongoDB DNS/network lookup failed. Check Atlas IP access, " +
                "outbound port 27017, or use Atlas's non-SRV connection string."
            )
        }
        throw error
    }
}

module.exports = connectDatabase
