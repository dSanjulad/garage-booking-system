// Central error handler — every controller either throws an AppError
// (via asyncHandler) or lets an unexpected error bubble up. Both land here
// so the API always returns a consistent { message } JSON error shape.
function errorHandler(err, req, res, next) {
  // A CHECK constraint (MySQL 3819, MariaDB 4025) or a malformed JSON body
  // is the client's fault, not a server fault.
  if (!err.isAppError && (err.errno === 3819 || err.errno === 4025)) {
    return res.status(400).json({ message: 'One of the values you sent is outside the allowed range.' });
  }
  if (!err.isAppError && err.errno === 1062) {
    return res.status(409).json({ message: 'That record already exists.' });
  }
  // Raised by the verified-review triggers in schema.sql.
  if (!err.isAppError && err.errno === 1644) {
    return res.status(409).json({ message: err.sqlMessage });
  }
  // Foreign key: the row is still used by bookings or reviews.
  if (!err.isAppError && (err.errno === 1451 || err.errno === 1452)) {
    return res.status(409).json({ message: 'This is linked to existing bookings, so it cannot be deleted. Hide it instead.' });
  }
  // Text too long for its column.
  if (!err.isAppError && err.errno === 1406) {
    return res.status(400).json({ message: 'One of the values you sent is too long.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON.' });
  }

  const statusCode = err.isAppError ? err.statusCode : 500;

  if (!err.isAppError) {
    // Unexpected error — log the full thing server-side for debugging,
    // but don't leak internals to the client.
    console.error('[unhandled error]', err);
  }

  res.status(statusCode).json({
    message: err.isAppError ? err.message : 'Something went wrong on our end. Please try again.',
    ...(err.isAppError ? err.extra : {})
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ message: `No route: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFoundHandler };
