const jwt = require('jsonwebtoken')
const users = require('../models/userSchema')

exports.checkAuth = async (req, res, next) => {

    //if token
    if (req.headers.token) {
        try {
            const token = req.headers.token

            const decoded = jwt.verify(token, process.env.JWTSECRET)
            //withour the password returns
            req.user = await users.findById(decoded.id).select("-password")
            next();
        } catch (err) {
            //console.log(err);
            res.status(401).json("authentication failed, login in please...")
        }
    } else {
        res.status(401).json('no token found, Sign In please')
    }
}

