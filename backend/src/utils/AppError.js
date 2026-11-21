// A small error class that carries an HTTP status code alongside the
// message, so controllers can `throw new AppError(404, 'Garage not found')`
// and the central error handler (middleware/errorHandler.js) knows what
// status code to respond with.
class AppError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    this.isAppError = true;
    // Optional machine-readable fields, e.g. { code: 'REVIEW_REQUIRED' }.
    this.extra = extra;
  }
}

module.exports = AppError;
