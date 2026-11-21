const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET = process.env.JWT_SECRET || 'dev_only_secret_change_me';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

function signToken(user) {
  // Keep the payload small — id + role is all the rest of the app needs.
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET, {
    expiresIn: EXPIRES_IN
  });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
