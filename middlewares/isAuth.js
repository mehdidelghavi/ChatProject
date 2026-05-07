const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = (req, res, next) => {
    const token = req.query.token || undefined;
    if (!token) {
        return res.redirect('/login');
    } else {

        try {
            jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) {
            return res.redirect('/login');
        }
    }
    next();
}