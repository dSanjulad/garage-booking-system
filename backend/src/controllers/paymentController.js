const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const paymentModel = require('../models/paymentModel');
const bookingModel = require('../models/bookingModel');
const { getProvider, providers } = require('../services/payments');

// Lets the interface label test mode and show the deposit amount correctly.
const config = (req, res) => {
  res.json({
    provider: getProvider().name,
    depositPercent: Number(process.env.DEPOSIT_PERCENT) || 20,
    live: false
  });
};

const start = asyncHandler(async (req, res) => {
  const { paymentType } = req.body;
  if (!['full', 'deposit'].includes(paymentType)) {
    throw new AppError(400, 'Choose a full payment or a deposit.');
  }
  const provider = getProvider();
  const payment = await paymentModel.startPayment({
    bookingId: Number(req.params.bookingId),
    customerId: req.user.id,
    paymentType,
    providerName: provider.name
  });
  const booking = await bookingModel.findById(payment.booking_id);
  res.status(201).json({ payment, checkout: provider.checkout(payment, booking) });
});

const listForBooking = asyncHandler(async (req, res) => {
  const booking = await bookingModel.findById(req.params.bookingId);
  if (!booking) throw new AppError(404, 'Booking not found.');
  if (req.user.role !== 'admin' && booking.customer_id !== req.user.id && booking.operator_id !== req.user.id) {
    throw new AppError(403, 'You do not have permission to view these payments.');
  }
  res.json({ payments: await paymentModel.findByBooking(req.params.bookingId) });
});

// Test-mode outcome, chosen on the simulated checkout screen. Refused for any
// payment that isn't simulated, so it can't mark a gateway payment as paid.
const simulate = asyncHandler(async (req, res) => {
  const payment = await paymentModel.findById(req.params.id);
  if (!payment) throw new AppError(404, 'Payment not found.');
  const booking = await bookingModel.findById(payment.booking_id);
  if (booking.customer_id !== req.user.id) throw new AppError(403, 'You can only complete your own payments.');
  if (payment.provider !== 'simulated') throw new AppError(409, 'Only simulated payments can be completed here.');
  const { outcome } = req.body;
  if (!['success', 'failure'].includes(outcome)) throw new AppError(400, 'Outcome must be success or failure.');
  const updated = await paymentModel.settle(payment.id, outcome === 'success' ? 'paid' : 'failed', `SIM-${payment.id}`);
  res.json({ payment: updated });
});

// Server-to-server notification from PayHere. The signature and the amount are
// both checked, because anyone on the internet can post to this URL.
const payhereNotify = asyncHandler(async (req, res) => {
  const { payhere } = providers;
  if (!payhere.verifyNotification(req.body)) {
    throw new AppError(400, 'Invalid payment signature.');
  }
  const payment = await paymentModel.findByOrderRef(String(req.body.order_id));
  if (!payment) throw new AppError(404, 'Unknown order.');
  if (Number(req.body.payhere_amount) !== Number(payment.amount) || req.body.payhere_currency !== payment.currency) {
    throw new AppError(400, 'Payment amount does not match this order.');
  }
  const status = payhere.statusFromCode(req.body.status_code);
  if (status !== 'pending') {
    await paymentModel.settle(payment.id, status, String(req.body.payment_id || ''));
  }
  res.send('OK');
});

module.exports = { config, start, listForBooking, simulate, payhereNotify };
