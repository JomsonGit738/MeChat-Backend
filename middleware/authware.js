const jwt = require('jsonwebtoken')
const users = require('../models/userSchema')

exports.checkAuth = async (req, res, next) => {
    // Prefer the HttpOnly cookie. Bearer support keeps non-browser API clients usable.
    const bearerToken = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null
    const token = req.cookies?.mechat_session || bearerToken

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWTSECRET)
            req.user = await users.findById(decoded.id).select("-password")
            if (!req.user) {
                return res.status(401).json("Session user no longer exists")
            }
            next();
        } catch (err) {
            res.status(401).json("Authentication failed, please sign in again")
        }
    } else {
        res.status(401).json('No session found, please sign in')
    }
}

