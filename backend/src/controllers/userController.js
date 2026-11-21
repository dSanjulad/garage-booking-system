const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const userModel = require('../models/userModel');

const listAll = asyncHandler(async (req, res) => {
  const users = await userModel.findAll();
  res.json({ users });
});

const updateRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['owner', 'operator', 'admin'].includes(role)) {
    throw new AppError(400, 'Role must be one of: owner, operator, admin.');
  }
  // Stops the platform being left with no administrator by accident.
  if (Number(req.params.id) === req.user.id && role !== 'admin') {
    throw new AppError(409, 'You cannot remove your own administrator role.');
  }
  const user = await userModel.updateRole(req.params.id, role);
  if (!user) throw new AppError(404, 'User not found.');
  res.json({ user });
});

module.exports = { listAll, updateRole };
