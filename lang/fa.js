module.exports = {
    fields: {
        username: 'نام کاربری',
        email: 'ایمیل',
        password: 'رمز عبور'
    },

    messages: {
        required: (field) => `${field} الزامی است`,
        min: (field, value) => `${field} باید حداقل ${value} کاراکتر باشد`,
        max: (field, value) => `${field} باید حداکثر ${value} کاراکتر باشد`,
        email: (field) => `${field} معتبر نیست`,
        invalid_type: (field) => `${field} نامعتبر است`
    }
};