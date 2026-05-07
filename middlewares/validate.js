module.exports = (schema) => (req, res, next) => {
    try {
        req.validated = schema.parse(req.body);
        next();
    } catch (err) {
        next(err); // 
    }
}