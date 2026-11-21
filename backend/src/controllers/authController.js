const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { signToken } = require('../utils/jwt');
const userModel = require('../models/userModel');
const { requireEmail, requireString, optionalString } = require('../utils/validate');

const VALID_ROLES = ['owner', 'operator'];
// 'admin' is intentionally excluded from self-registration — admins are
// promoted by an existing admin via PATCH /users/:id/role, not created
// by anyone who fills in the sign-up form.

const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body;

  if (!name || !email || !password) {
    throw new AppError(400, 'Name, email and password are all required.');
  }
  requireString(name, 'Name', 120);
  requireEmail(email);
  optionalString(phone, 'Phone', 30);
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    throw new AppError(400, 'Password must be between 6 and 72 characters long.');
  }
  const chosenRole = role && VALID_ROLES.includes(role) ? role : 'owner';

  const existing = await userModel.findByEmail(email.toLowerCase().trim());
  if (existing) {
    throw new AppError(409, 'An account with that email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userModel.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    phone,
    role: chosenRole
  });

  const token = signToken(user);
  res.status(201).json({ token, user });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw new AppError(400, 'Email and password are required.');
  }

  const user = await userModel.findByEmail(email.toLowerCase().trim());
  if (!user) {
    throw new AppError(401, 'Incorrect email or password.');
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    throw new AppError(401, 'Incorrect email or password.');
  }

  const token = signToken(user);
  const { password_hash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

const me = asyncHandler(async (req, res) => {
  const user = await userModel.findById(req.user.id);
  if (!user) throw new AppError(404, 'User not found.');
  res.json({ user });
});

module.exports = { register, login, me };
