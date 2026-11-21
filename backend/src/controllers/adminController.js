const asyncHandler = require('../utils/asyncHandler');
const statsModel = require('../models/statsModel');
const notificationModel = require('../models/notificationModel');

const platformStats = asyncHandler(async (req, res) => {
  res.json({ stats: await statsModel.forPlatform() });
});

const notifications = asyncHandler(async (req, res) => {
  res.json({ notifications: await notificationModel.findRecent(100) });
});

const homeStats = asyncHandler(async (req, res) => {
  res.json(await statsModel.forHome());
});

module.exports = { platformStats, notifications, homeStats };
