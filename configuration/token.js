const jwt = require('jsonwebtoken')

const generateToken = (id) =>{
    // Short-lived sessions limit damage if a cookie is ever captured.
    return jwt.sign({ id }, process.env.JWTSECRET, { expiresIn: '8h' })
}

module.exports = generateToken
