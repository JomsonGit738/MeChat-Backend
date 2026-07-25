const bcrypt = require("bcryptjs")
const users = require("../models/userSchema")

const demoAccounts = [
    {
        username: process.env.DEMO_USER_1_NAME || "Alice Demo",
        email: process.env.DEMO_USER_1_EMAIL || "alice.demo@mechat.local"
    },
    {
        username: process.env.DEMO_USER_2_NAME || "Bob Demo",
        email: process.env.DEMO_USER_2_EMAIL || "bob.demo@mechat.local"
    },
    {
        username: process.env.DEMO_USER_3_NAME || "Charlie Demo",
        email: process.env.DEMO_USER_3_EMAIL || "charlie.demo@mechat.local"
    }
]

const seedDemoUsers = async () => {
    if (process.env.SEED_DEMO_USERS !== "true") return

    // Demo credentials must never be created in a production database.
    if (process.env.NODE_ENV === "production") {
        throw new Error("SEED_DEMO_USERS cannot be enabled in production")
    }

    const demoPassword = process.env.DEMO_USER_PASSWORD || "Demo123!"
    if (demoPassword.length < 8 || demoPassword.length > 128) {
        throw new Error("DEMO_USER_PASSWORD must contain 8 to 128 characters")
    }

    const password = await bcrypt.hash(demoPassword, 12)

    for (const account of demoAccounts) {
        const normalizedAccount = {
            username: account.username.trim(),
            email: account.email.trim().toLowerCase()
        }
        if (!normalizedAccount.username || !normalizedAccount.email) {
            throw new Error("Demo user names and emails must be configured")
        }

        const exists = await users.exists({ email: normalizedAccount.email })
        if (exists) continue

        // Create only missing accounts. Existing local data is never overwritten.
        await users.create({
            ...normalizedAccount,
            password,
            authProvider: "local",
            mychats: []
        })
    }

    console.log("Development demo users are ready")
}

module.exports = seedDemoUsers
