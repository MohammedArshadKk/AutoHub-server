/**
 * Async error handler wrapper
 * Eliminates try-catch blocks in async route handlers
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

module.exports = catchAsync;
