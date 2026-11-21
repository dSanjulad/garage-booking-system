// Wraps an async Express route handler so any rejected promise / thrown
// error is forwarded to next(err) instead of crashing the process or
// requiring a try/catch in every single controller function.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
