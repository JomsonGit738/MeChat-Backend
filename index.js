require('dotenv').config()
const express = require('express')
const cors = require('cors')
require('./db/connection')
const router = require('./routers/router')
const { Socket } = require('socket.io')

const server = express()

server.use(cors())
server.use(express.json())
server.use(router)


const PORT = 4000 || process.env.PORT

const oneServer = server.listen(PORT, () => {
    console.log('MeChat server online ' + PORT);
})

const io = require('socket.io')(oneServer, {
    pingTimeout: 60000,
    cors: {
        origin: 'http://localhost:3000'
    }
})

io.on("connection", (socket) => {

    socket.on('setup', (userData) => {
        socket.join(userData.id)
        socket.emit('connection');
    })

    socket.on('join chat', (room) => {
        socket.join(room);
    })

    socket.on('typing', (room) => socket.in(room).emit('typing'));
    socket.on('stop typing', (room) => socket.in(room).emit('stop typing'));

    socket.on('newMessage', ({ data: newMessageReceived, friendId }) => {
        var chat = newMessageReceived.chat;
        if (!chat.users) {
            return //console.log('chat.users not defined');
        }
        var i = 0
        chat.users.forEach(user => {
            if (user._id == newMessageReceived.sender._id) {
                return
            } else {
                socket.in(user._id).emit('message received', { newMessageReceived, friendId });
            }

        });
    })
    socket.off("setup", () => {
        socket.leave(userData.id)
    })
})

server.get('/', (request, response) => {
    response.send(`<h4>MeChat server online</h4>`)
})
