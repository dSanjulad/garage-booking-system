const express = require('express');
const bookingController = require('../controllers/bookingController');
const reviewController = require('../controllers/reviewController');
const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, authorize('owner'), bookingController.create);
router.get('/my', authenticate, authorize('owner'), bookingController.myBookings);
router.get('/my/pending-reviews', authenticate, authorize('owner'), bookingController.pendingReviews);
router.get('/garage/:garageId', authenticate, authorize('operator', 'admin'), bookingController.forGarage);
router.get('/:id', authenticate, bookingController.getOne);
router.patch('/:id/cancel', authenticate, bookingController.cancel);
router.patch('/:id/reschedule', authenticate, authorize('owner'), bookingController.reschedule);
router.patch('/:id/status', authenticate, authorize('operator', 'admin'), bookingController.updateStatus);
router.patch('/:id/stage', authenticate, authorize('operator', 'admin'), bookingController.updateStage);
router.patch('/:id/confirm-service', authenticate, authorize('owner'), bookingController.confirmService);

// A review is created against a specific booking.
router.post('/:bookingId/review', authenticate, authorize('owner'), (req, res, next) => {
  req.body.bookingId = req.params.bookingId;
  next();
}, reviewController.create);

// Payments for a booking.
router.post('/:bookingId/payments', authenticate, authorize('owner'), paymentController.start);
router.get('/:bookingId/payments', authenticate, paymentController.listForBooking);

module.exports = router;
