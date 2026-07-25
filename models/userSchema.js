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
        select: false,
        required: function () {
            return this.authProvider === "local"
        }
    },
    authProvider: {
        type: String,
        enum: ["local", "google"],
        default: "local",
        required: true
    },
    googleSub: {
        type: String,
        select: false,
        unique: true,
        sparse: true
    },
    url: {
        type: String,
        required: true,
        default: "https://i.postimg.cc/C1ZdC9LH/user.png"
    },
    mobile: {
        type: String,
        required: true,
        default: "not-provided"
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
