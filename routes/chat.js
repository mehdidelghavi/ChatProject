const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chat/chat");
const isAuth = require("../middlewares/isAuth");

router.get("/", isAuth, chatController.getChat);
module.exports = router;