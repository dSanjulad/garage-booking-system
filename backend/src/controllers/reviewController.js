const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const reviewModel = require('../models/reviewModel');
const bookingModel = require('../models/bookingModel');
const { requireId, optionalString } = require('../utils/validate');

const listForGarage = asyncHandler(async (req, res) => {
  const reviews = await reviewModel.findByGarage(req.params.garageId);
  res.json({ reviews });
});

// A review needs a booking that belongs to this customer, has been completed
// and has no review yet. These checks give clear messages; the triggers and the
// UNIQUE key in schema.sql enforce the same rules if anything bypasses them.
const create = asyncHandler(async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  if (!bookingId || !rating) {
    throw new AppError(400, 'bookingId and rating are required.');
  }
  if (typeof rating === 'object' || !Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
    throw new AppError(400, 'Rating must be a whole number from 1 to 5.');
  }
  const id = requireId(bookingId, 'bookingId');

  const booking = await bookingModel.findById(id);
  if (!booking) throw new AppError(404, 'Booking not found.');
  if (booking.customer_id !== req.user.id) {
    throw new AppError(403, 'You can only review your own bookings.');
  }
  if (booking.status !== 'completed') {
    throw new AppError(409, 'You can only review a booking once the service has been completed.');
  }
  if (await reviewModel.findByBooking(id)) {
    throw new AppError(409, 'You have already reviewed this booking.');
  }

  const review = await reviewModel.create({
    bookingId: id,
    garageId: booking.garage_id,
    customerId: req.user.id,
    rating: Number(rating),
    comment: optionalString(comment, 'Comment', 2000)
  });
  res.status(201).json({ review });
});

// Admin moderation: hide (with a reason) or restore a review.
const listForModeration = asyncHandler(async (req, res) => {
  res.json({ reviews: await reviewModel.findAllForModeration() });
});

const moderate = asyncHandler(async (req, res) => {
  const { hidden, reason } = req.body;
  if (typeof hidden !== 'boolean') throw new AppError(400, 'hidden must be true or false.');
  const why = optionalString(reason, 'Reason', 255);
  if (hidden && !why) throw new AppError(400, 'Give a reason for hiding this review.');
  const found = await reviewModel.setHidden(req.params.id, hidden, why);
  if (!found) throw new AppError(404, 'Review not found.');
  res.json({ ok: true });
});

module.exports = { listForGarage, create, listForModeration, moderate };
