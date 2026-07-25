const users = require('../models/userSchema')
const chats = require('../models/chatSchema')
const messages = require('../models/messageSchema')
const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
const {
    clearSessionCookie,
    setSessionCookie,
    toPublicUser,
    verifyGoogleCredential
} = require('../configuration/auth')

const normalizeEmail = (email = "") => email.trim().toLowerCase()
const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const publicUserFields = "-password -mobile -mychats -googleSub -authProvider"

const findAuthorizedChat = (chatId, userId) => {
    if (!mongoose.isValidObjectId(chatId)) return null
    return chats.findOne({ _id: chatId, users: userId })
}


//checking whether the Email exits or not
exports.uniqueEmail = async (req, res) => {
    const email = normalizeEmail(req.body.email)
    const preuser = await users.findOne({ email })
    if (preuser) {
        res.status(409).json("Unable to use this email")
    } else {
        res.status(200).json('unique email')
    }
}

//register user by creating an account
exports.register = async (req, res) => {
    const username = req.body.username?.trim()
    const email = normalizeEmail(req.body.email)
    const { password } = req.body

    if (
        !username ||
        username.length > 50 ||
        !email ||
        email.length > 254 ||
        !password ||
        password.length < 8 ||
        password.length > 128
    ) {
        return res.status(400).json("Invalid registration details")
    }

    try {
        const preuser = await users.findOne({ email })
        if (preuser) {
            // Never return an existing account document; it may contain private fields.
            return res.status(409).json("Unable to create account")
        } else {
            const newUser = new users({
                username,
                email,
                password: await bcrypt.hash(password, 12),
                authProvider: "local",
                mychats: []
            })
            await newUser.save()
            res.status(201).json(toPublicUser(newUser))
        }


    } catch (error) {
        console.log(error);
        res.status(401).json(error)
    }
}

//login user 
exports.login = async (req, res) => {
    const email = normalizeEmail(req.body.email)
    const { password } = req.body

    if (!email || email.length > 254 || !password || password.length > 128) {
        return res.status(400).json("Email and password are required")
    }

    try {
        const user = await users.findOne({ email }).select("+password")
        let passwordMatches = false

        if (user?.password && user.password !== "#23Gsin") {
            if (user.password.startsWith("$2")) {
                passwordMatches = await bcrypt.compare(password, user.password)
            } else {
                // Transparently migrate legacy plaintext passwords after a valid login.
                passwordMatches = password === user.password
                if (passwordMatches) {
                    user.password = await bcrypt.hash(password, 12)
                    await user.save()
                }
            }
        }

        if (user && passwordMatches && user.authProvider !== "google") {
            setSessionCookie(res, user._id)
            res.status(200).json(toPublicUser(user))
        } else {
            res.status(401).json("Invalid email or password")
        }
    }
    catch (err) {
        res.status(403).json(err)
    }
}

//Google Sign in
exports.googlesignin = async (req, res) => {
    try {
        if (!req.body.credential) {
            return res.status(400).json("Google credential is required")
        }

        // Verification checks Google's signature, issuer, audience and expiry.
        const payload = await verifyGoogleCredential(req.body.credential)
        if (!payload?.sub || !payload?.email || !payload.email_verified) {
            return res.status(401).json("Google account could not be verified")
        }

        const email = normalizeEmail(payload.email)
        let user = await users.findOne({ googleSub: payload.sub }).select("+password")

        if (!user) {
            const accountWithEmail = await users.findOne({ email }).select("+password")

            if (accountWithEmail) {
                const isLegacyGoogleAccount = accountWithEmail.password === "#23Gsin"
                if (!isLegacyGoogleAccount && accountWithEmail.authProvider !== "google") {
                    return res.status(409).json(
                        "An account already exists for this email. Sign in with its password first."
                    )
                }

                // Safely migrate accounts created by the old unverified Google flow.
                accountWithEmail.authProvider = "google"
                accountWithEmail.googleSub = payload.sub
                accountWithEmail.password = undefined
                accountWithEmail.username = payload.name || accountWithEmail.username
                accountWithEmail.url = payload.picture || accountWithEmail.url
                user = await accountWithEmail.save()
            } else {
                user = await users.create({
                    username: payload.name || "Google user",
                    email,
                    url: payload.picture,
                    authProvider: "google",
                    googleSub: payload.sub,
                    mobile: "not-provided",
                    mychats: []
                })
            }
        } else {
            user.username = payload.name || user.username
            user.url = payload.picture || user.url
            await user.save()
        }

        setSessionCookie(res, user._id)
        res.status(200).json(toPublicUser(user))
    } catch (error) {
        console.error("Google sign-in verification failed:", error.message)
        res.status(401).json("Google sign-in could not be verified")
    }
}

exports.logout = (req, res) => {
    clearSessionCookie(res)
    res.status(204).send()
}

exports.session = (req, res) => {
    res.status(200).json(toPublicUser(req.user))
}

//search user
exports.searchUser = async (req, res) => {
    try {
        const search = escapeRegex(String(req.query.search || "").slice(0, 100))
        const keyword = search
            ? {
                $or: [
                    { username: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } }
                ]
            }
            : {}

        //except the current user, all user details (.find)
        //users found when token checking => authware.js => req.user
        //$ne = not equal to
        const result = await users.find(keyword).find(
            { _id: { $ne: req.user._id } }
        ).select(publicUserFields).limit(25)
        res.status(200).json(result)

    } catch (err) {
        console.log(err);
        res.status(410).json(err)
    }

    //res.status(201).json(keyword)
}

//adding new chat to the user
exports.accessChat = async (req, res) => {
    const { userId } = req.body

    if (!mongoose.isValidObjectId(userId) || userId === req.user._id.toString()) {
        return res.status(400).json("Invalid user")
    }
    if (!await users.exists({ _id: userId })) {
        return res.status(404).json("User not found")
    }

    var isChat = await chats.find(
        {
            isGroupChat: false,
            $and: [
                { users: { $elemMatch: { $eq: req.user._id } } },
                { users: { $elemMatch: { $eq: userId } } }
            ]
        }
    ).populate("users", publicUserFields)
        .populate('latestMessage')

    isChat = await users.populate(isChat, {
        path: 'latestMessage.sender',
        select: "username url email"
    })

    //if chat exists
    if (isChat.length > 0) {
        try {
            //if user deleted the chat, here chatId is pushed again to mychats array of the user
            const chatIdToCheck = isChat[0]._id
            await users.findOneAndUpdate(
                { _id: req.user._id, mychats: { $ne: chatIdToCheck } }, // Check if chatIdToCheck doesn't exist
                { $addToSet: { mychats: chatIdToCheck } }, // Add chatIdToCheck to mychats if it doesn't exist
                { new: true } // Return the updated user document
            )
                .then(updatedUser => {
                    if (updatedUser) {
                        console.log(`Chat ID ${chatIdToCheck} added to the user's mychats array.`);
                    } else {
                        console.log(`Chat ID ${chatIdToCheck} already exists in the user's mychats array.`);
                    }
                })
                .catch(err => {
                    console.error('Error updating user:', err);
                });
        } catch (error) {
            console.log(error)
        }
        res.send(isChat[0])
    } else {
        var chatData = {
            chatName: "sender",
            isGroupChat: false,
            users: [req.user._id, userId]
        }

        try {
            //creating chat
            const createChat = await chats.create(chatData)
            //storing createChat id to users array


            //101 12-09-2023
            await users.updateMany(
                { _id: { $in: [req.user._id, userId] } },
                { $push: { mychats: createChat._id } },
                { multi: true }
            )

            //101 12-02-2023
            const FullChat = await chats.findOne({ _id: createChat._id })
                .populate("users", publicUserFields)

            res.status(200).json(FullChat)
        } catch (err) {
            console.log(err.message);
            res.status(401).json(err)
        }

    }

}

//fetching the chats from user
exports.fetchChat = async (req, res) => {


    try {
        const user = await users.findOne({ _id: req.user._id })
            .populate('mychats')
            .exec();

        if (!user) {
            console.log('User not found');
        } else {

            const userChats = user.mychats;
            const binder = await chats.find({ _id: { $in: userChats } })
                .populate({
                    path: "users",
                    select: publicUserFields
                })
                .populate("latestMessage")
                .sort({ updatedAt: -1 })
                .exec();


            await users.populate(binder, {
                path: "latestMessage.sender",
                select: "username url email"
            });
            res.status(200).json(binder)

        }

    } catch (err) {
        console.log(err);
        res.status(401).json(err)
    }
}

exports.sendMessages = async (req, res) => {

    const { content, chatId } = req.body

    if (typeof content !== "string" || !content.trim() || content.length > 4000) {
        return res.status(400).json('Message must contain 1 to 4000 characters')
    }

    try {
        // Authentication alone is insufficient: the sender must belong to the chat.
        const chat = await findAuthorizedChat(chatId, req.user._id)
        if (!chat) {
            return res.status(403).json("You do not have access to this chat")
        }

        var mess = await messages.create({
            sender: req.user._id,
            content: content.trim(),
            chat: chatId
        })

        //populate
        mess = await mess.populate('sender', 'username url')
        mess = await mess.populate('chat')
        mess = await users.populate(mess, {
            path: 'chat.users',
            select: 'username url email'
        })

        await chats.findByIdAndUpdate(req.body.chatId, {
            latestMessage: mess
        })

        // Broadcast only the message that was authenticated, validated, and
        // persisted above. The browser cannot choose recipients or relay data.
        const io = req.app.get("io")
        mess.chat.users.forEach((user) => {
            if (user._id.toString() !== req.user._id.toString()) {
                io.to(user._id.toString()).emit("message received", {
                    newMessageReceived: mess
                })
            }
        })

        res.status(200).json(mess)

    } catch (error) {
        console.log(error);
        res.status(401).json(error)
    }


}

//messages of the chats
exports.allMessages = async (req, res) => {
    try {
        const chat = await findAuthorizedChat(req.params.chatId, req.user._id)
        if (!chat) {
            return res.status(403).json("You do not have access to this chat")
        }

        const mess =
            await messages.find({ chat: req.params.chatId })
                //await messages.find(chats.findById(req.params.chatId))
                .populate('sender', 'username url email')
                .populate('chat')

        res.status(200).json(mess)


    } catch (err) {
        console.log(err);
        res.status(401).json(err)
    }
}

exports.removeUser = async (req, res) => {

    const chatId = req.params.id
    const userId = req.user._id


    if (!chatId || !userId) {
        res.status(401).json("empty field found")
    }
    else {
        // console.log(chatId + " : " + userId)
        // res.status(200).json(chatId + " : " + userId)

        await users.findOneAndUpdate(
            { _id: userId },
            { $pull: { mychats: chatId } },
            { new: true, select: '-password -url -email -mobile' }
        )
            .then(updatedUser => {
                if (updatedUser) {
                    //console.log(`Chat ID ${chatIdToRemove} removed from the user's mychats array.`);
                    res.status(200).json(updatedUser)
                } else {
                    console.log(`User not found or chat ID ${chatIdToRemove} not found in the user's mychats array.`);
                }
            })
            .catch(err => {
                console.error('Error updating user:', err);
            });

    }
}

exports.createGroupChat = async (req, res) => {

    if (!req.body.name || !req.body.users) {
        return res.status(400).json("Group name and users are required")
    }

    let parsedUsers
    try {
        parsedUsers = JSON.parse(req.body.users)
    } catch {
        return res.status(400).json("Group users must be a valid list")
    }

    const name = String(req.body.name).trim()
    if (!Array.isArray(parsedUsers) || !name || name.length > 80 || parsedUsers.length > 50) {
        return res.status(400).json("Invalid group details")
    }

    // The authenticated creator is added by the server, never trusted from input.
    const uniqueUserIds = [...new Set(parsedUsers)].filter(
        (id) => id !== req.user._id.toString()
    )
    if (
        uniqueUserIds.length === 0 ||
        uniqueUserIds.some((id) => !mongoose.isValidObjectId(id))
    ) {
        return res.status(400).json("Add at least one valid group member")
    }

    try {
        const existingUserCount = await users.countDocuments({ _id: { $in: uniqueUserIds } })
        if (existingUserCount !== uniqueUserIds.length) {
            return res.status(400).json("One or more group members do not exist")
        }

        const userIdsToUpdate = [...uniqueUserIds, req.user._id.toString()]

        const newGroup = await chats.create({
            chatName: name,
            users: userIdsToUpdate,
            isGroupChat: true,
            groupAdmin: req.user._id

        })

        //push chat id to all users in the Group
        await users.updateMany(
            { _id: { $in: userIdsToUpdate } }, // Filter by user IDs in the array
            { $addToSet: { mychats: newGroup._id } })


        const GroupChat = await chats.findOne({ _id: newGroup._id })
            .populate("users", publicUserFields)
            .populate("groupAdmin", publicUserFields)

        res.status(200).json(GroupChat)

    } catch (error) {
        console.log(error)
        res.status(500).json("Unable to create group")
    }

}

exports.renameGroupChat = async (req, res) => {
    const { chatId, chatName } = req.body;

    if (!mongoose.isValidObjectId(chatId) || !chatName?.trim() || chatName.length > 80) {
        return res.status(400).json("Invalid group details")
    }

    // The database filter enforces admin authorization atomically with the update.
    const updatedChat = await chats.findOneAndUpdate(
        { _id: chatId, isGroupChat: true, groupAdmin: req.user._id },
        {
            chatName: chatName.trim(),
        },
        {
            new: true,
        }
    )
        .populate("users", publicUserFields)
        .populate("groupAdmin", publicUserFields);

    if (!updatedChat) {
        return res.status(403).json("Only the group administrator can rename this group")
    } else {
        res.json(updatedChat);
    }
}

exports.deleteUserFromGroup = async (req, res) => {
    const { userId, chatId } = req.body

    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(chatId)) {
        return res.status(400).json("Invalid group or user")
    }
    if (userId === req.user._id.toString()) {
        return res.status(400).json("Use leave group to remove your own account")
    }

    try {
        const removed = await chats.findOneAndUpdate(
            {
                _id: chatId,
                isGroupChat: true,
                groupAdmin: req.user._id,
                users: userId
            },
            {
                $pull: { users: userId },
            },
            {
                new: true,
            }
        )
            .populate("users", publicUserFields)
            .populate("groupAdmin", publicUserFields);

        if (!removed) {
            return res.status(403).json("Only the group administrator can remove members")
        } else {
            await users.findOneAndUpdate(
                { _id: userId },
                { $pull: { mychats: chatId } })
            res.status(200).json(removed);
        }
    }
    catch (error) {
        console.log(error)
        res.status(401).json(error)
    }



}

exports.searchAddUserforGroup = async (req, res) => {

    try {
        const search = escapeRegex(String(req.query.search || "").slice(0, 100))
        const keyword = search
            ? {
                $or: [
                    { username: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } }
                ],
                _id: { $ne: req.user._id }
            }
            : {} //avoid empty search appearance of current user

        //except the current user, all user details (.find)
        //users found when token checking => authware.js => req.user
        //$ne = not equal to data

        const result = await users.findOne(keyword).select(publicUserFields)

        res.status(200).json(result)

    } catch (err) {
        console.log(err);
        res.status(410).json(err)
    }



}

exports.addNewUserToGroup = async (req, res) => {
    const { userId, chatId } = req.body

    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(chatId)) {
        return res.status(400).json("Invalid group or user")
    }

    try {
        const added = await chats.findOneAndUpdate(
            { _id: chatId, isGroupChat: true, groupAdmin: req.user._id },
            {
                $addToSet: { users: userId },
            },
            {
                new: true,
            }
        )
            .populate("users", publicUserFields)
            .populate("groupAdmin", publicUserFields);

        if (!added) {
            return res.status(403).json("Only the group administrator can add members")
        } else {
            await users.findOneAndUpdate(
                { _id: userId },
                { $addToSet: { mychats: chatId } })
            res.status(200).json(added);
        }
    }
    catch (error) {
        console.log(error)
        res.status(401).json(error)
    }
}

exports.leaveGroupChat = async (req, res) => {
    const { chatId } = req.body
    if (!mongoose.isValidObjectId(chatId)) {
        return res.status(400).json("Invalid group")
    }

    try {
        // User identity and admin status come from verified server state, not the request.
        const group = await chats.findOne({
            _id: chatId,
            isGroupChat: true,
            users: req.user._id
        })
        if (!group) {
            return res.status(403).json("You are not a member of this group")
        }

        const remainingMembers = group.users.filter(
            (id) => id.toString() !== req.user._id.toString()
        )

        if (remainingMembers.length === 0) {
            await chats.deleteOne({ _id: group._id })
            await messages.deleteMany({ chat: group._id })
            await users.updateOne(
                { _id: req.user._id },
                { $pull: { mychats: group._id } }
            )
            return res.status(204).send()
        }

        const update = { $pull: { users: req.user._id } }
        if (group.groupAdmin?.toString() === req.user._id.toString()) {
            update.$set = { groupAdmin: remainingMembers[0] }
        }

        const updatedGroup = await chats.findByIdAndUpdate(group._id, update, { new: true })
            .populate("users", publicUserFields)
            .populate("groupAdmin", publicUserFields)

        await users.updateOne(
            { _id: req.user._id },
            { $pull: { mychats: group._id } }
        )

        res.status(200).json(updatedGroup)
    } catch (error) {
        console.error(error)
        res.status(500).json("Unable to leave group")
    }
}
