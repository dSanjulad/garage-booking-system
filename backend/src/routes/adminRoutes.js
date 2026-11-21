const express = require('express');
const adminController = require('../controllers/adminController');
const reviewController = require('../controllers/reviewController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const admin = [authenticate, authorize('admin')];

router.get('/stats', admin, adminController.platformStats);
router.get('/notifications', admin, adminController.notifications);
router.get('/reviews', admin, reviewController.listForModeration);
router.patch('/reviews/:id', admin, reviewController.moderate);

module.exports = router;
