const mongoose = require('mongoose')

const userSchema = mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        default: "#23Gsin"
    },
    url: {
        type: String,
        required: true,
        default: "https://i.postimg.cc/C1ZdC9LH/user.png"
    },
    mobile: {
        type: String,
        required: true,
        default: "#45Gauth"
    },
    mychats: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "chats"
        }
    ]
},
    { timestamps: true }
)

const users = mongoose.model("users", userSchema)

module.exports = users