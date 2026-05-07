const express = require("express");
const router = express.Router();
const loginController = require("../controllers/auth/login");
const isAuth = require("../middlewares/isAuth");
const validate = require("../middlewares/validate");
const { loginSchema } = require("../validations/auth.validation");

router.get("/login", loginController.getLogin);
router.post("/login", validate(loginSchema), loginController.postLogin);

module.exports = router;