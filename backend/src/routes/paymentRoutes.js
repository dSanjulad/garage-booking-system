const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/config', paymentController.config);
router.post('/:id/simulate', authenticate, authorize('owner'), paymentController.simulate);
// PayHere posts form-encoded data and cannot send a login token.
router.post('/payhere/notify', express.urlencoded({ extended: false }), paymentController.payhereNotify);

module.exports = router;
