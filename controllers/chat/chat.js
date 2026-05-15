const db = require("../../init/db");
const jwt = require("jsonwebtoken");
const sanitizeHtml = require("sanitize-html");

exports.getChat = async (req, res) => {
    try {
        const token = req.query.token;
        let user;
        jwt.verify(token, process.env.JWT_SECRET, function (err, decoded) {
            user = decoded;
        })
        const sql = `SELECT
                t.*,
                u.username
                FROM (
                    SELECT *
                    FROM chats
                    WHERE room_id = 1
                    ORDER BY id DESC
                    LIMIT 20
                ) AS t
                JOIN users u ON t.user_id = u.id
                ORDER BY t.id ASC`;
        const [rows] = await db.execute(sql);
        const conversationSQL = `SELECT 
                            r.id AS room_id,
                            u2.id AS other_user_id,
                            u2.username AS other_user_name,
                            (
                                SELECT COUNT(*)
                                FROM chats c
                                WHERE c.room_id = r.id
                                AND c.user_id != ru1.user_id
                                AND c.seen_at IS NULL
                            ) AS unseen_count
                            FROM rooms r
                            JOIN room_user ru1 ON ru1.room_id = r.id
                            JOIN room_user ru2 ON ru2.room_id = r.id AND ru2.user_id != ru1.user_id
                            JOIN users u2 ON u2.id = ru2.user_id
                            WHERE ru1.user_id = ?`;
        const [rows2] = await db.execute(conversationSQL, [user.user.id]);
        const getAdminSQL = "SELECT * from users where role = 'Admin' OR role ='Support'";
        const [rows3] = await db.execute(getAdminSQL);
        res.render('index', {
            user: user.user,
            isAuth: true,
            publicChats: rows,
            privateChats: rows2,
            admins: rows3,
            title: "پشت پرده"
        });
    } catch (e) {
        console.log(e);
    }
}

exports.sendMessage = async (data) => {
    try {
        const { text, userId } = data;
        let room = data.privateRoomId || 1;
        const sql = 'INSERT INTO chats (user_id, room_id, text) VALUES (?,?,?)';
        const values = [userId, room, sanitizeHtml(text)];
        const [result] = await db.execute(sql, values);
        const newChatId = result.insertId;
        const query = `
            SELECT c.*, u.username 
            FROM chats c 
            JOIN users u ON c.user_id = u.id 
            WHERE c.id = ?`;
        const [rows] = await db.execute(query, [newChatId]);
        const newChat = rows[0];
        return {
            status: 201,
            message: "چت با موفقیت در دیتابیس ایجاد شد",
            chat: newChat
        };
    } catch (err) {
        return {
            status: 500,
            message: "خطایی رخ داد"
        };
    }
}

exports.getRoomFormUserIds = async (data) => {
    try {
        const { userId, otherUser } = data;
        const checkSql = `SELECT *
                            FROM room_user ru1
                            JOIN room_user ru2 ON ru1.room_id = ru2.room_id
                            WHERE ru1.user_id = ? AND ru2.user_id = ?
                            LIMIT 1`;
        const [existingRooms] = await db.execute(checkSql, [userId, otherUser]);
        if (existingRooms.length > 0) {
            const chatSql = `SELECT
                                t.*,
                                u.username
                            FROM (
                                SELECT *
                                FROM chats
                                where room_id = ?
                                ORDER BY id DESC
                                LIMIT 20
                            ) AS t
                            JOIN users u ON t.user_id = u.id
                            ORDER BY t.id ASC`;
            const [rows] = await db.execute(chatSql, [existingRooms[0].room_id]);
            const chats = rows;
            const room_id = existingRooms[0].room_id;
            const otherUserSql = "SELECT username,id FROM users where id = ? LIMIT 1";
            const [result] = await db.execute(otherUserSql, [otherUser]);
            const otherUserInfo = result;
            return { chats: chats, room: room_id, otherUser: otherUserInfo };
        } else {
            const [result] = await db.execute(
                `INSERT INTO rooms (type,title,created_by) VALUES (?, ?, ?)`,
                ["private", "conversation", userId]
            );
            const room_id = result.insertId;
            // 3. افزودن هر دو کاربر به روم (در یک عملیات)
            const insertRoomUserSql = `
            INSERT INTO room_user (room_id, user_id) VALUES (?, ?), (?, ?)`;
            await db.execute(insertRoomUserSql, [room_id, userId, room_id, otherUser]);
            const chatSql = `SELECT
                                t.*,
                                u.username
                            FROM (
                                SELECT *
                                FROM chats
                                where room_id = ?
                                ORDER BY id DESC
                                LIMIT 20
                            ) AS t
                            JOIN users u ON t.user_id = u.id
                            ORDER BY t.id ASC`;
            const [rows] = await db.execute(chatSql, [room_id]);
            const chats = rows;
            const otherUserSql = "SELECT username,id FROM users where id = ? LIMIT 1";
            const [result2] = await db.execute(otherUserSql, [otherUser]);
            const otherUserInfo = result2;
            return { chats: chats, room: room_id, otherUser: otherUserInfo };
        }
    } catch (e) {
        return e;
    }
}

exports.seenchat = async (data) => {
    const chatId = data;
    const date = new Date();
    const seenChatSQL = `UPDATE chats set seen_at = ? where id = ?`;
    const [result] = await db.execute(seenChatSQL, [date, chatId]);
}

exports.getPrivateChats = async (data) => {
    const userId = data;
    const getPrivateChatsSQL = `SELECT room_id,user_id from room_user where user_id = ?`;
    const [rows] = await db.execute(getPrivateChatsSQL, [userId]);
    return rows;
}

exports.seenChats = async (data) => {
    try {
        const userId = data.userId;
        const room_id = data.room_id;
        const date = new Date();
        const seenSQL = `UPDATE chats set seen_at = ? where room_id = ? and user_id != ?`;
        const [result] = await db.execute(seenSQL, [date, room_id, userId]);
        return {
            message: "پیام ها با موفقیت دیده شدند",
            success: true
        };
    } catch (e) {
        return {
            message: "خطایی در ارتباط با دیتابیس رخ داد",
            errorMessage: e,
            success: false
        }
    }
}