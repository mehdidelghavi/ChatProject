const fa = require('../lang/fa');

module.exports = (issues) => {
    const errors = {};

    issues.forEach(issue => {
        const fieldKey = issue.path[0];
        const field = fa.fields[fieldKey] || fieldKey;

        let message;

        switch (issue.code) {
            case 'invalid_type':
                if (issue.received === 'undefined') {
                    message = fa.messages.required(field);
                } else {
                    message = fa.messages.invalid_type(field);
                }
                break;

            case 'too_small':
                message = fa.messages.min(field, issue.minimum);
                break;

            case 'too_big':
                message = fa.messages.max(field, issue.maximum);
                break;

            case 'invalid_string':
                if (issue.validation === 'email') {
                    message = fa.messages.email(field);
                }
                break;

            default:
                message = issue.message;
        }

        if (!errors[fieldKey]) errors[fieldKey] = [];
        errors[fieldKey].push(message);
    });

    return errors;
};