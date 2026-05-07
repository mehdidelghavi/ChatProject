const { ZodError } = require('zod');
const formatZodError = require('../utils/formatZodError');

module.exports = (schema) => {
    return (data, callback) => {
        try {
            const validData = schema.parse(data);
            return { ok: true, data: validData };
        } catch (err) {
            if (err instanceof ZodError) {
                return {
                    ok: false,
                    errors: formatZodError(err.issues)
                };
            }

            return {
                ok: false,
                errors: { general: ['مشکل در برقراری ارتباط'] }
            };
        }
    };
};