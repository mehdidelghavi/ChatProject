const { ZodError } = require("zod");
const formatZodError = require('../utils/formatZodError');

module.exports = (err, req, res, next) => {
    if (err instanceof ZodError) {
        return res.status(422).json({
            message: 'خطا در اعتبار سنجی',
            status: 422,
            errors: formatZodError(err.issues)
        });
    }

    return res.status(500).json({
        message: 'مشکل در برقراری ارتباط با سرور',
    });
}