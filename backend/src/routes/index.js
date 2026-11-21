const express = require('express');
const { homeStats } = require('../controllers/adminController');

const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/garages', require('./garageRoutes'));
router.use('/services', require('./serviceRoutes'));
router.use('/slots', require('./slotRoutes'));
router.use('/bookings', require('./bookingRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/payments', require('./paymentRoutes'));
router.use('/admin', require('./adminRoutes'));
router.get('/home', homeStats);

module.exports = router;
