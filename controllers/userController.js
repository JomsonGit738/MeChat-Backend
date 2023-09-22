const users = require('../models/userSchema')
const chats = require('../models/chatSchema')
const messages = require('../models/messageSchema')
const generateToken = require('../configuration/token')


//checking whether the Email exits or not
exports.uniqueEmail = async (req, res) => {
    const { email } = req.body
    const preuser = await users.findOne({ email })
    if (preuser) {
        res.status(210).json("This email is already in use. use another email")
    } else {
        res.status(200).json('unique email')
    }
}

//register user by creating an account
exports.register = async (req, res) => {


    const { username, email, password, url, mobile } = req.body
    try {
        const preuser = await users.findOne({ email })
        if (preuser) {

            res.status(200).json(preuser)
        } else {
            const newUser = new users({
                username,
                email,
                password,
                url,
                mobile,
                mychats: []
            })
            await newUser.save()
            res.status(200).json(newUser)
        }


    } catch (error) {
        console.log(error);
        res.status(401).json(error)
    }
}

//login user 
exports.login = async (req, res) => {
    const { email, password } = req.body
    try {
        const user = await users.findOne({ email, password })

        if (user) {
            res.status(200).json(
                {
                    id: user._id,
                    url: user.url,
                    username: user.username,
                    email: user.email,
                    token: generateToken(user._id)
                }
            )
        } else {
            res.status(404).json("wrong Email or password!")
        }
    }
    catch (err) {
        res.status(403).json(err)
    }
}

//Google Sign in
exports.googlesignin = async (req, res) => {


    const { username, email, password, url, mobile } = req.body
    try {
        //if user exists
        const user = await users.findOne({ email })
        if (user) {
            res.status(200).json(
                {
                    id: user._id,
                    url: user.url,
                    username: user.username,
                    email: user.email,
                    token: generateToken(user._id)
                }
            )
        }
        //if new user signing in
        else {
            const newUser = new users({
                username,
                email,
                password,
                url,
                mobile,
                mychats: []
            })
            await newUser.save()
            res.status(200).json(
                {
                    id: newUser._id,
                    url: newUser.url,
                    username: newUser.username,
                    email: newUser.email,
                    token: generateToken(newUser._id)
                }
            )
        }


    } catch (error) {
        console.log(error);
        res.status(401).json(error)
    }
}

//search user
exports.searchUser = async (req, res) => {
    try {
        const keyword = req.query.search
            ? {
                $or: [
                    { username: { $regex: req.query.search, $options: "i" } },
                    { email: { $regex: req.query.search, $options: "i" } }
                ]
            }
            : {}

        //except the current user, all user details (.find)
        //users found when token checking => authware.js => req.user
        //$ne = not equal to
        const result = await users.find(keyword).find(
            { _id: { $ne: req.user._id } }
        )
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

    if (!userId) {
        //console.log('no userId found for accessChat');
        return res.sendStatus(400)
    }

    var isChat = await chats.find(
        {
            isGroupChat: false,
            $and: [
                { users: { $elemMatch: { $eq: req.user._id } } },
                { users: { $elemMatch: { $eq: userId } } }
            ]
        }
    ).populate("users", "-password")
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
                .populate("users", "-password")

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
                    select: "-password -mobile"
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

    if (!content || !chatId) {
        console.log('no content OR no chatId');
        res.status(401).json('no content OR chatId found')
    }
    try {
        var mess = await messages.create({
            sender: req.user._id,
            content: content,
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

        res.status(200).json(mess)

    } catch (error) {
        console.log(error);
        res.status(401).json(error)
    }


}

//messages of the chats
exports.allMessages = async (req, res) => {
    try {

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
        res.status(401).json("Empty field found!")
    }

    const userIdsToUpdate = [...JSON.parse(req.body.users), req.user._id.toString()];
    const usersData = JSON.parse(req.body.users)
    usersData.push(req.user) //object

    try {

        const newGroup = await chats.create({
            chatName: req.body.name,
            users: usersData,
            isGroupChat: true,
            groupAdmin: req.user

        })

        //push chat id to all users in the Group
        await users.updateMany(
            { _id: { $in: userIdsToUpdate } }, // Filter by user IDs in the array
            { $push: { mychats: newGroup._id } })


        const GroupChat = await chats.findOne({ _id: newGroup._id })
            .populate("users", "-password")
            .populate("groupAdmin", "-password")

        res.status(200).json(GroupChat)

    } catch (error) {
        console.log(error)
        res.status(401).json(error)
    }

}

exports.renameGroupChat = async (req, res) => {
    const { chatId, chatName } = req.body;

    const updatedChat = await chats.findByIdAndUpdate(
        chatId,
        {
            chatName: chatName,
        },
        {
            new: true,
        }
    )
        .populate("users", "-password")
        .populate("groupAdmin", "-password");

    if (!updatedChat) {
        res.status(404);
        throw new Error("Chat Not Found");
    } else {
        res.json(updatedChat);
    }
}

exports.deleteUserFromGroup = async (req, res) => {
    const { userId, chatId } = req.body

    try {
        const removed = await chats.findByIdAndUpdate(
            chatId,
            {
                $pull: { users: userId },
            },
            {
                new: true,
            }
        )
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        //remove chatid from user mychat array    
        await users.findOneAndUpdate(
            { _id: userId },
            { $pull: { mychats: chatId } })

        if (!removed) {
            res.status(404);
            throw new Error("Chat Not Found");
        } else {
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
        const keyword = req.query.search
            ? {
                $or: [
                    { username: { $regex: req.query.search, $options: "i" } },
                    { email: { $regex: req.query.search, $options: "i" } }
                ],
                _id: { $ne: req.user._id }
            }
            : {} //avoid empty search appearance of current user

        //except the current user, all user details (.find)
        //users found when token checking => authware.js => req.user
        //$ne = not equal to data

        const result = await users.findOne(keyword).select('-password -mobile -mychats')

        res.status(200).json(result)

    } catch (err) {
        console.log(err);
        res.status(410).json(err)
    }



}

exports.addNewUserToGroup = async (req, res) => {
    const { userId, chatId } = req.body

    try {
        const added = await chats.findByIdAndUpdate(
            chatId,
            {
                $push: { users: userId },
            },
            {
                new: true,
            }
        )
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        //add chatid to user mychat array    
        await users.findOneAndUpdate(
            { _id: userId },
            { $push: { mychats: chatId } })

        if (!added) {
            res.status(404);
            throw new Error("Chat Not Found");
        } else {
            res.status(200).json(added);
        }
    }
    catch (error) {
        console.log(error)
        res.status(401).json(error)
    }
}

exports.leaveGroupChat = async (req, res) => {
    const { chatId, userId, isAdmin, newAdmin } = req.body
    if (!chatId || !userId || !newAdmin) {
        res.status(404).json('Chat Not Found');
    } else {

        try {
            if (isAdmin) {
                const adminremoved = await chats.findByIdAndUpdate(
                    chatId,
                    {
                        $pull: { users: userId },
                    },
                    {
                        new: true,
                    }
                )
                adminremoved.groupAdmin = newAdmin
                await adminremoved.save()

                await users.findOneAndUpdate(
                    { _id: userId },
                    { $pull: { mychats: chatId } })

                if (!adminremoved) {
                    res.status(404).json('Chat Not Found');
                } else {
                    res.status(200).json(adminremoved);
                }

            }
            else {
                const removed = await chats.findByIdAndUpdate(
                    chatId,
                    {
                        $pull: { users: userId },
                    },
                    {
                        new: true,
                    }
                )
                    .populate("users", "-password")
                    .populate("groupAdmin", "-password");

                //remove chatid from user mychat array    
                await users.findOneAndUpdate(
                    { _id: userId },
                    { $pull: { mychats: chatId } })

                if (!removed) {
                    res.status(404).json('Chat Not Found');
                } else {
                    res.status(200).json(removed);
                }
            }

        } catch (error) {
            console.log(error)
            res.status(401).json(error)

        }


    }

}