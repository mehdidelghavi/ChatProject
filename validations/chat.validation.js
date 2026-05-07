const { z } = require("zod");
const chatSchema = z.object({
    text: z.string().min(1, "پیغام باید حداقل 1 کاراکتر داشته باشد").max(500, "پیغام باید کمتر از 500 کاراکتر باشد")
});

module.exports = {
    chatSchema
};