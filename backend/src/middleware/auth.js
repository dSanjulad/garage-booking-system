const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

// Verifies the Bearer token on the request and attaches the decoded
// payload ({ id, role, name }) to req.user. Every route that needs to
// know "who is calling" uses this first.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(new AppError(401, 'Authentication required — please log in.'));
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    next(new AppError(401, 'Your session has expired — please log in again.'));
  }
}

// Restricts a route to one or more roles, e.g. authorize('operator', 'admin').
// Must run after authenticate().
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required — please log in.'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'You do not have permission to do that.'));
    }
    next();
  };
}

// Like authenticate(), but doesn't fail the request if no token is present.
// Useful for endpoints that behave differently for logged-in vs anonymous
// users (e.g. garage search) without requiring a login.
function attachUserIfPresent(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      // Invalid/expired token on an optional route — just proceed as anonymous.
    }
  }
  next();
}

module.exports = { authenticate, authorize, attachUserIfPresent };
