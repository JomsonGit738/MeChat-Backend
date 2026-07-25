const { OAuth2Client } = require("google-auth-library")
const generateToken = require("./token")

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

const sessionCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // The deployed frontend and API use different sites, so production needs
    // SameSite=None plus partitioning. Localhost remains Lax without HTTPS.
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    partitioned: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/"
}

exports.verifyGoogleCredential = async (credential) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
        throw new Error("GOOGLE_CLIENT_ID is not configured")
    }

    const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
    })
    return ticket.getPayload()
}

exports.setSessionCookie = (res, userId) => {
    res.cookie("mechat_session", generateToken(userId), sessionCookieOptions)
}

exports.clearSessionCookie = (res) => {
    res.clearCookie("mechat_session", {
        ...sessionCookieOptions,
        maxAge: undefined
    })
}

exports.toPublicUser = (user) => ({
    id: user._id,
    url: user.url,
    username: user.username,
    email: user.email
})
