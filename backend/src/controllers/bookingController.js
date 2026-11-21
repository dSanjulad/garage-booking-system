const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const pool = require('../config/db');
const bookingModel = require('../models/bookingModel');
const garageModel = require('../models/garageModel');
const notificationService = require('../services/notificationService');
const { requireId, optionalString, requireVehicleType } = require('../utils/validate');
const { slotHasStarted } = require('../utils/timeSlots');

// Fire-and-forget: the booking is already committed, so a slow or failing mail
// provider must never delay or fail the response.
function notify(promise) {
  promise.catch((err) => console.error('[notification error]', err.message));
}

const create = asyncHandler(async (req, res) => {
  const { slotId, serviceId, notes, vehicleType, vehicleDetails } = req.body;
  if (!slotId || !serviceId) {
    throw new AppError(400, 'slotId and serviceId are required.');
  }

  const booking = await bookingModel.createBooking({
    slotId: requireId(slotId, 'slotId'),
    serviceId: requireId(serviceId, 'serviceId'),
    customerId: req.user.id,
    notes: optionalString(notes, 'Notes', 500),
    vehicleType: vehicleType === undefined ? 'car' : requireVehicleType(vehicleType),
    vehicleDetails: optionalString(vehicleDetails, 'Vehicle details', 120)
  });

  notify(notificationService.sendBookingConfirmation(booking));
  res.status(201).json({ booking });
});

const myBookings = asyncHandler(async (req, res) => {
  const bookings = await bookingModel.findByCustomer(req.user.id);
  res.json({ bookings });
});

// Operator: incoming bookings for one of their garages.
const forGarage = asyncHandler(async (req, res) => {
  const garage = await garageModel.findById(req.params.garageId);
  if (!garage) throw new AppError(404, 'Garage not found.');
  if (req.user.role !== 'admin' && garage.operator_id !== req.user.id) {
    throw new AppError(403, 'You can only view bookings for your own garages.');
  }
  const bookings = await bookingModel.findByGarage(req.params.garageId);
  res.json({ bookings });
});

function assertCanTouchBooking(booking, user, { operatorOnly = false, customerOnly = false } = {}) {
  if (user.role === 'admin') return;
  const isOwningCustomer = booking.customer_id === user.id;
  const isOwningOperator = booking.operator_id === user.id;
  if (operatorOnly && !isOwningOperator) {
    throw new AppError(403, 'Only the garage operator can do that.');
  }
  if (customerOnly && !isOwningCustomer) {
    throw new AppError(403, 'Only the customer on this booking can do that.');
  }
  if (!isOwningCustomer && !isOwningOperator) {
    throw new AppError(403, 'You do not have permission to view or modify this booking.');
  }
}

async function loadBooking(id) {
  const booking = await bookingModel.findById(id);
  if (!booking) throw new AppError(404, 'Booking not found.');
  return booking;
}

// One booking, with the timeline behind the service tracker.
const getOne = asyncHandler(async (req, res) => {
  const booking = await loadBooking(req.params.id);
  assertCanTouchBooking(booking, req.user);
  const events = await bookingModel.findEvents(booking.id);
  res.json({ booking, events });
});

const cancel = asyncHandler(async (req, res) => {
  const existing = await loadBooking(req.params.id);
  assertCanTouchBooking(existing, req.user);
  // Once the appointment has started, only the garage can call it off.
  if (req.user.role === 'owner' && existing.status === 'confirmed' && slotHasStarted(existing.slot_date, existing.start_time)) {
    throw new AppError(409, 'This appointment has already started. Please contact the garage.');
  }

  const booking = await bookingModel.cancelBooking(req.params.id);
  notify(notificationService.sendBookingCancellation(booking));
  res.json({ booking });
});

const reschedule = asyncHandler(async (req, res) => {
  const newSlotId = requireId(req.body.slotId, 'slotId');
  const existing = await loadBooking(req.params.id);
  assertCanTouchBooking(existing, req.user);

  const booking = await bookingModel.rescheduleBooking(req.params.id, newSlotId);
  notify(notificationService.sendBookingRescheduled(booking));
  res.json({ booking });
});

// Operator marks a booking completed or no-show once its time has started
// (or, for completed, once the job is in service).
const updateStatus = asyncHandler(async (req, res) => {
  const existing = await loadBooking(req.params.id);
  assertCanTouchBooking(existing, req.user, { operatorOnly: true });
  const booking = await bookingModel.setStatus(req.params.id, req.body.status);
  if (booking.status === 'completed') notify(notificationService.sendReviewRequest(booking));
  res.json({ booking });
});

// Completed bookings this customer still has to review.
const pendingReviews = asyncHandler(async (req, res) => {
  const pending = await bookingModel.findPendingReviews(pool, req.user.id);
  res.json({ required: process.env.REVIEW_REQUIRED !== 'false', pending });
});

// Operator moves the job along the tracker the customer can see.
const updateStage = asyncHandler(async (req, res) => {
  const existing = await loadBooking(req.params.id);
  assertCanTouchBooking(existing, req.user, { operatorOnly: true });
  const booking = await bookingModel.advanceStage(req.params.id, req.body.stage, optionalString(req.body.note, 'Note', 255));
  if (booking.job_stage === 'ready') notify(notificationService.sendVehicleReady(booking));
  res.json({ booking });
});

/*
 * Reviews depend on the operator marking a job complete, so an operator could
 * block bad reviews by never doing so. If the operator hasn't acted within the
 * grace period after the appointment ended, the customer can confirm the
 * service took place, which unlocks their review. The record shows who did it.
 */
const confirmService = asyncHandler(async (req, res) => {
  const existing = await loadBooking(req.params.id);
  assertCanTouchBooking(existing, req.user, { customerOnly: true });
  const graceHours = Number(process.env.SERVICE_CONFIRM_GRACE_HOURS) || 24;
  const unlockAt = new Date(new Date(`${existing.slot_date}T${existing.end_time}`).getTime() + graceHours * 3600000);
  if (new Date() < unlockAt) {
    throw new AppError(409, `You can confirm this service ${graceHours} hours after the appointment if the garage hasn't.`);
  }
  const booking = await bookingModel.finishBooking(req.params.id, 'completed', 'customer');
  res.json({ booking });
});

module.exports = { create, myBookings, forGarage, getOne, cancel, reschedule, updateStatus, updateStage, confirmService, pendingReviews };
