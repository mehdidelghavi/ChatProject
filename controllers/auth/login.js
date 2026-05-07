const bcrypt = require("bcryptjs");
const db = require("../../init/db");
const jwt = require("jsonwebtoken");

require("dotenv").config();

exports.getLogin = (req, res) => {
    let message = req.flash('errorMessage');

    if (message.length > 0) {
        message = message[0];
    } else {
        message = null;
    }
    res.render("auth/login", {
        errorMessage: message
    });
}

exports.postLogin = async (req, res) => {
    const data = req.validated;
    const username = data.username;
    const password = data.password;
    const hashedPassword = await bcrypt.hash(password, 12);
    const privateKey = process.env.JWT_SECRET;
    query = `SELECT * from users where username='${username}'`;
    const [rows, fields] = await db.execute(query);
    if (rows.length > 0) {
        const user = rows[0];
        const isMatched = await bcrypt.compare(password, user.password);
        if (isMatched) {
            let token = jwt.sign({ user: user, exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), }, privateKey);
            res.status(200).json({
                message: "با موفقیت لاگین شدید",
                status: 200,
                token: token
            });
        } else {
            res.status(401).json({
                message: "متاسفانه رمز عبور نادرست است",
                status: 401
            });
        }
    } else {
        try {
            const query = 'INSERT INTO users (username, password) VALUES (?,?)';
            const [result] = await db.execute(query, [username, hashedPassword]);
            const newUserId = result.insertId;
            const query2 = `SELECT * from users where id = ?`;
            const [rows] = await db.execute(query2, [newUserId]);
            const newUser = rows[0];
            req.session.isLoggedIn = true;
            req.session.user = newUser;
            return req.session.save(err => {
                req.flash("successMessage", "با موفقیت وارد حساب کاربری شدید");
                res.redirect('/');
            });
        } catch (err) {
            req.flash("errorMessage", err.message());
            res.redirect('/');
        }

    }
}