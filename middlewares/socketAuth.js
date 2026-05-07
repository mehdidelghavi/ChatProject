const jwt = require("jsonwebtoken");
require("dotenv").config();
exports.socketAuth = (token) => {
    try {
        jwt.verify(token, process.env.JWT_SECRET);
        return true;
    } catch (e) {
        return false;
    }
}