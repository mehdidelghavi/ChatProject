const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();
const path = require("path");
const db = require("./init/db");
const session = require("express-session");
const MYSQLStore = require("express-mysql-session")(session);
const loginRoute = require("./routes/auth");
const chatRoute = require("./routes/chat");
const socketMiddleware = require("./middlewares/socketAuth");
const http = require("http");
const socketio = require("socket.io");
var flash = require('connect-flash');
const chatController = require("./controllers/chat/chat");
const { z } = require("zod");
const { chatSchema } = require("./validations/chat.validation");
const jwt = require("jsonwebtoken");

const sessionStore = new MYSQLStore({}, db);

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const onlineUsers = new Map();
const socketIdToUserIdMap = new Map();
const privateChannelFlag = "private_channel_";

app.set("views", "views");
app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(session({
    key: 'session_cookie_name',
    secret: 'session_cookie_secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // یک روز
        httpOnly: true,
        secure: false, // اگر https نداری باید false باشد
    }
}));
app.use(flash());
app.use(loginRoute);
app.use(chatRoute);
app.use(require('./middlewares/errorHandler'));

function emitOnlineUsers() {

    io.emit(
        "updateOnlineUsers",
        Array.from(
            onlineUsers,
            ([userId, data]) => ({
                userId,
                username: data.username
            })
        )
    );
}

let typingUsers = new Set();

const messageLimiter = new Map();

// This fuction handle spams
function isRateLimited(socketId) {

    const now = Date.now();

    const limitData = messageLimiter.get(socketId);

    if (!limitData) {

        messageLimiter.set(socketId, {
            count: 1,
            time: now
        });

        return false;
    }

    if (now - limitData.time > 10000) {

        messageLimiter.set(socketId, {
            count: 1,
            time: now
        });

        return false;
    }

    limitData.count++;

    if (limitData.count > 5) {
        return true;
    }

    return false;
}

io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        socket.user = decoded.user;

        next();
    } catch {
        next(new Error("Unauthorized"));
    }
});
// Start socket connection
io.on("connection", (socket) => {
    socket.privateChannelIDS = [];


    // Handle user connection to socket and add user to online users Map
    socket.on("identifyUser", async (userData) => {
        const userId = socket.user.id;
        if (!onlineUsers.has(userId)) {

            onlineUsers.set(userId, {
                username: socket.user.username,
                sockets: new Set()
            });
        }

        onlineUsers.get(userId).sockets.add(socket.id);

        socketIdToUserIdMap.set(socket.id, userId);

        // Get User Private Chats 
        const userPrivateChats = await chatController.getPrivateChats(userId);
        userPrivateChats.forEach(privateChatItems => {
            socket.privateChannelIDS.push(privateChatItems.room_id);
            socket.join(`private_channel_${privateChatItems.room_id}`);
        });
        emitOnlineUsers();
    });

    // Handle user typing in private chat
    socket.on("privateTyping", (data) => {
        socket.broadcast.to(`private_channel_${data.privateRoomId}`).emit("privateUserTyping", { username: socket.user.username, room: data.privateRoomId });
    });

    // Handle user stop typing in private chat
    socket.on("privateStopTyping", (data) => {
        socket.broadcast.to(`private_channel_${data.privateRoomId}`).emit("privateUserStopTyping", { username: socket.user.username, room: data.privateRoomId });
    });

    // Handle user typing in global chat
    socket.on("typing", (data) => {
        if (!typingUsers.has(data.username)) {
            typingUsers.add(data.username);
            socket.broadcast.emit('userTyping', data.username);
        }
    });

    // Handle user stop typing in global chat
    socket.on("stopTyping", (data) => {
        typingUsers.delete(data.username);
        socket.broadcast.emit('userStoppedTyping', data.username);
    });

    // Handle send message to global chat
    socket.on("sendMessage", async (data) => {
        const isAuth = socketMiddleware.socketAuth(data.token);
        if (isAuth) {
            const parsed = chatSchema.safeParse(data);
            data.userId = socket.user.id;
            if (!parsed.success) {
                io.to(socket.id).emit('validationError', {
                    success: false,
                    type: "validation_error",
                    message: parsed.error.issues[0].message
                });
                return;
            };
            if (isRateLimited(socket.id)) {

                io.to(socket.id).emit('validationError', {
                    success: false,
                    type: "rate_limit",
                    message: "از ارسال اسپم خودداری نمایید"
                });
                return;
            }
            const sendMessage = await chatController.sendMessage(data);
            io.emit("getPublicMessage", sendMessage);
        } else {
            io.to(socket.id).emit("UnAuthorized", "لطفا مجدد وارد حساب کاربری خود شوید");
        }
    });

    // Handle send message in private
    socket.on("sendMessagePrivate", async (data) => {
        const isAuth = socketMiddleware.socketAuth(data.token);
        if (isAuth) {
            const parsed = chatSchema.safeParse(data);
            if (!parsed.success) {
                io.to(socket.id).emit('validationError', {
                    success: false,
                    type: "validation_error",
                    message: parsed.error.issues[0].message
                });
                return;
            };
            if (isRateLimited(socket.id)) {

                io.to(socket.id).emit('validationError', {
                    success: false,
                    type: "rate_limit",
                    message: "از ارسال اسپم خودداری نمایید"
                });
                return;
            }
            // Handle Save Message To Database
            data.userId = socket.user.id;
            const sendMessage = await chatController.sendMessage(data);
            io.to(`private_channel_${data.privateRoomId}`).emit("getPrivateMessage", sendMessage);
        } else {
            io.to(socket.id).to(`private_channel_${data.privateRoomId}`).emit("UnAuthorized", "لطفا مجدد وارد حساب کاربری خود شوید");
        }
    });


    // Handle start private chat for user
    socket.on("startPrivateChat", async (data) => {
        data.userId = socket.user.id;
        username = socket.user.username;
        const isAuth = socketMiddleware.socketAuth(data.token);
        if (isAuth) {
            const joinedPrivateChannels = socket.privateChannelIDS;
            // Check If Conversation (room) Exist
            const roomData = await chatController.getRoomFormUserIds(data);
            const exitsPrivateChat = joinedPrivateChannels.includes(roomData.room);
            if (!exitsPrivateChat) {
                socket.privateChannelIDS.push(roomData.room);
                socket.join(`private_channel_${roomData.room}`);
                const otherUserSocketId = [...socketIdToUserIdMap.entries()].find(([k, v]) => v === data.otherUser)?.[0];
                io.to(otherUserSocketId).emit("startedPrivateChat", { userId: data.userId, username: username, room_id: roomData.room });
            }
            // Seen Unread Chats
            const seen = await chatController.seenChats({ userId: data.userId, room_id: roomData.room });
            io.to(socket.id).emit("openPrivateChat", roomData);
        } else {
            io.to(socket.id).to(socket.privateChannelId).emit("UnAuthorized", "لطفا مجدد وارد حساب کاربری خود شوید");
        }
    });

    socket.on("joinPrivateChat", (data) => {
        const userId = socket.user.id;
        const room_id = data.room_id;
        socket.privateChannelIDS.push(room_id);
        socket.join(`private_channel_${room_id}`);
    });

    socket.on("seenChat", async (data) => {
        await chatController.seenchat(data.chatId);
    });


    // Handle if user close private chat
    // socket.on("leavePrivate", (data) => {
    //     socket.privateChannelId = 0;
    //     socket.leave("private_channel_" + data);
    // });


    // Handle user disconnecting 
    socket.on('disconnect', () => {
        const userId = socketIdToUserIdMap.get(socket.id);

        if (!userId) return;

        const user = onlineUsers.get(userId);

        if (!user) return;

        user.sockets.delete(socket.id);

        socketIdToUserIdMap.delete(socket.id);

        if (user.sockets.size === 0) {

            onlineUsers.delete(userId);

        }
        emitOnlineUsers();
    });

});


server.listen(process.env.port, () => {
    console.log(`App is Running on Port ${process.env.port}`);
});