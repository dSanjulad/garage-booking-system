const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Slows down password guessing. Registration isn't limited here because the
// concurrency tests create many accounts at once.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please wait a few minutes and try again.' }
});

router.post('/register', register);
router.post('/login', loginLimiter, login);
router.get('/me', authenticate, me);

module.exports = router;
