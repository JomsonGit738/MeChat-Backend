const express = require('express')
const userController = require('../controllers/userController')
const authware = require('../middleware/authware')


const router = new express.Router()

router.post('/unique', userController.uniqueEmail)

router.post('/register', userController.register)

router.post('/login', userController.login)

router.post('/googlesignin', userController.googlesignin)

//token
router.get('/search-user', authware.checkAuth, userController.searchUser)

//token
router.post('/chat', authware.checkAuth, userController.accessChat)

//token
router.get('/chat', authware.checkAuth, userController.fetchChat)

//send/create messages
router.post('/msg', authware.checkAuth, userController.sendMessages)

//messages
router.get('/msg/:chatId', authware.checkAuth, userController.allMessages)

//remove user from chats
router.delete('/chat/removeuser/:id', authware.checkAuth, userController.removeUser)

//Group Section => 

//creating new Group
router.post('/chat/newgroup', authware.checkAuth, userController.createGroupChat)

//renaming the group
router.put('/chat/renamegroup', authware.checkAuth, userController.renameGroupChat)

//Delete User from group
router.delete('/chat/deletegroupuser', authware.checkAuth, userController.deleteUserFromGroup)

//Search user to add in the Group
router.get('/chat/groupsearch', authware.checkAuth, userController.searchAddUserforGroup)

//add new user to group
router.post('/chat/addgroupuser', authware.checkAuth, userController.addNewUserToGroup)

//Leave groupChat
router.put('/chat/leavegroupchat', authware.checkAuth, userController.leaveGroupChat)

module.exports = router