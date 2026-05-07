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

let typingUsers = new Set();

const messageLimiter = new Map();

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

io.on("connection", (socket) => {


    socket.on("identifyUser", (userData) => {
        onlineUsers.set(userData.userId, userData.username);
        socketIdToUserIdMap.set(socket.id, userData.userId);
        io.emit("updateOnlineUsers", Array.from(onlineUsers, ([userId, username]) => ({ userId, username })));
    });

    socket.on("privateTyping", (data) => {
        socket.broadcast.to(`private_channel_${data.privateRoomId}`).emit("privateUserTyping", { username: data.username, room: data.privateRoomId });
    });
    socket.on("privateStopTyping", (data) => {
        socket.broadcast.to(`private_channel_${data.privateRoomId}`).emit("privateUserStopTyping", { username: data.username, room: data.privateRoomId });
    });
    socket.on("typing", (data) => {
        if (!typingUsers.has(data.username)) {
            typingUsers.add(data.username);
            socket.broadcast.emit('userTyping', data.username);
        }
    });

    socket.on("stopTyping", (data) => {
        typingUsers.delete(data.username);
        socket.broadcast.emit('userStoppedTyping', data.username);
    });

    // Handle Send Message to Clients
    socket.on("sendMessage", async (data) => {
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
            const sendMessage = await chatController.sendMessage(data);
            io.emit("getPublicMessage", sendMessage);
        } else {
            io.to(socket.id).emit("UnAuthorized", "لطفا مجدد وارد حساب کاربری خود شوید");
        }
    });

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
            const sendMessage = await chatController.sendMessage(data);
            io.to(socket.privateChannelId).emit("getPrivateMessage", sendMessage);
        } else {
            io.to(socket.id).to(socket.privateChannelId).emit("UnAuthorized", "لطفا مجدد وارد حساب کاربری خود شوید");
        }
    });

    socket.on("startPrivateChat", async (data) => {
        const isAuth = socketMiddleware.socketAuth(data.token);
        if (isAuth) {
            // Check If Conversation (room) Exist
            const roomData = await chatController.getRoomFormUserIds(data);
            socket.privateChannelId = privateChannelFlag + roomData.room;
            socket.join(socket.privateChannelId);
            io.to(socket.id).emit("openPrivateChat", roomData);
        } else {
            io.to(socket.id).to(socket.privateChannelId).emit("UnAuthorized", "لطفا مجدد وارد حساب کاربری خود شوید");
        }
    });

    socket.on("leavePrivate", (data) => {
        socket.privateChannelId = 0;
        socket.leave("private_channel_" + data);
    });


    socket.on('disconnect', () => {
        // پیدا کردن userId کاربر بر اساس socket.id از نگاشت
        const userId = socketIdToUserIdMap.get(socket.id);

        if (userId) {
            const username = onlineUsers.get(userId);
            onlineUsers.delete(userId); // حذف از لیست کاربران آنلاین
            socketIdToUserIdMap.delete(socket.id); // حذف از نگاشت socket ID

            // ارسال لیست به‌روز شده کاربران آنلاین به همه کلاینت‌ها
            const usersArray = Array.from(onlineUsers, ([userId, username]) => ({ userId, username }));
            io.emit("updateOnlineUsers", usersArray);
        } else {
            console.warn(`Socket ID ${socket.id} در نگاشت کاربران آنلاین یافت نشد.`);
        }
    });
});

server.listen(process.env.port, () => {
    console.log(`App is Running on Port ${process.env.port}`);
});