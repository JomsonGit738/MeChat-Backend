require('dotenv').config()

const dns = require("node:dns")
const http = require("node:http")
const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { parseCookie } = require('cookie')
const helmet = require('helmet')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const { rateLimit } = require('express-rate-limit')

// Configure an optional resolver before MongoDB starts its SRV lookup.
const configuredDnsServers = (process.env.DNS_SERVERS || "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean)
if (configuredDnsServers.length > 0) {
    dns.setServers(configuredDnsServers)
}

const connectDatabase = require('./db/connection')
const seedDemoUsers = require('./configuration/seedDemoUsers')
const router = require('./routers/router')
const users = require('./models/userSchema')
const chats = require('./models/chatSchema')

if (!process.env.JWTSECRET) {
    throw new Error("JWTSECRET must be configured")
}

const server = express()
const allowedOrigins = (process.env.CLIENT_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

const corsOptions = {
    credentials: true,
    origin(origin, callback) {
        // Requests without Origin include server-to-server and health checks.
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true)
        }
        callback(new Error("Origin is not allowed by CORS"))
    }
}

server.disable("x-powered-by")
server.use(helmet())
server.use(cors(corsOptions))
server.use(express.json({ limit: "100kb" }))
server.use(cookieParser())
server.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false
}))
server.use(
    ["/login", "/register", "/googlesignin"],
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: "draft-8",
        legacyHeaders: false
    })
)
server.use(router)

const PORT = process.env.PORT || 4000
const httpServer = http.createServer(server)

const io = require('socket.io')(httpServer, {
    pingTimeout: 60000,
    cors: {
        origin: allowedOrigins,
        credentials: true
    }
})
server.set("io", io)

// Authenticate before accepting any events; never trust a user id sent by a client.
io.use(async (socket, next) => {
    try {
        const cookies = parseCookie(socket.handshake.headers.cookie || "")
        const token = cookies.mechat_session
        if (!token) {
            return next(new Error("Authentication required"))
        }

        const decoded = jwt.verify(token, process.env.JWTSECRET)
        const user = await users.findById(decoded.id).select("_id")
        if (!user) {
            return next(new Error("Session user not found"))
        }

        socket.userId = user._id.toString()
        next()
    } catch (error) {
        // Keep the client response generic, but retain the server-side cause for
        // diagnosing configuration or database failures.
        console.error("Socket authentication failed:", error.message)
        next(new Error("Invalid session"))
    }
})

const isChatMember = async (chatId, userId) => {
    if (!mongoose.isValidObjectId(chatId)) return false
    return Boolean(await chats.exists({ _id: chatId, users: userId }))
}

const allowSocketEvent = (socket, eventName, limit, windowMs) => {
    const now = Date.now()
    const previous = socket.data.eventRates?.[eventName] || []
    const recent = previous.filter((timestamp) => now - timestamp < windowMs)
    if (recent.length >= limit) return false

    socket.data.eventRates = socket.data.eventRates || {}
    socket.data.eventRates[eventName] = [...recent, now]
    return true
}

io.on("connection", (socket) => {
    // A per-user room supports private delivery without exposing room selection.
    socket.join(socket.userId)

    socket.on('join chat', async (chatId) => {
        if (!allowSocketEvent(socket, "join", 30, 10_000)) return
        if (await isChatMember(chatId, socket.userId)) {
            socket.join(chatId)
        }
    })

    socket.on('typing', async (chatId) => {
        if (!allowSocketEvent(socket, "typing", 30, 10_000)) return
        if (await isChatMember(chatId, socket.userId)) {
            socket.in(chatId).emit('typing', { chatId })
        }
    })

    socket.on('stop typing', async (chatId) => {
        if (!allowSocketEvent(socket, "typing", 30, 10_000)) return
        if (await isChatMember(chatId, socket.userId)) {
            socket.in(chatId).emit('stop typing', { chatId })
        }
    })

})

server.get('/', (request, response) => {
    response.send('<h4>MeChat server online</h4>')
})

// Do not report a healthy API until its required database is available.
connectDatabase()
    .then(async () => {
        await seedDemoUsers()
        httpServer.listen(PORT, () => {
            console.log(`MeChat server online ${PORT}`)
        })
    })
    .catch((error) => {
        console.error(`MongoDB connection error: ${error.message}`)
        process.exitCode = 1
    })
