const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const slotModel = require('../models/slotModel');
const serviceModel = require('../models/serviceModel');
const { assertCanManage } = require('./garageController');
const { requireDate } = require('../utils/validate');
const { todayLocalISO, dateRange, slotsNeeded, slotLengthMinutes, annotateSlots } = require('../utils/timeSlots');

// Public: live availability for a garage on a date. With ?serviceId= each slot
// also says whether that service can start there, because a long service needs
// several free slots in a row.
const listForGarageAndDate = asyncHandler(async (req, res) => {
  const { date, serviceId } = req.query;
  if (!date) throw new AppError(400, 'A ?date=YYYY-MM-DD query parameter is required.');
  requireDate(date, 'date');
  const slots = await slotModel.findByGarageAndDate(req.params.garageId, date);

  let needed = 1;
  if (serviceId && slots.length) {
    const service = await serviceModel.findById(Number(serviceId));
    if (service && service.garage_id === Number(req.params.garageId)) {
      needed = slotsNeeded(service.duration_minutes, slotLengthMinutes(slots[0]));
    }
  }
  res.json({ slots: annotateSlots(slots, needed), slots_needed: needed });
});

// Public: free bays per day, for the date picker.
const availability = asyncHandler(async (req, res) => {
  const from = todayLocalISO();
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 31);
  const [y, m, d] = from.split('-').map(Number);
  const to = new Date(Date.UTC(y, m - 1, d + days - 1)).toISOString().slice(0, 10);
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
  const rows = await slotModel.availabilityByDay(req.params.garageId, from, to, nowTime);
  const byDay = new Map(rows.map((r) => [r.slot_date, r]));
  res.json({
    days: dateRange(from, to).map((date) => ({
      date,
      free_bays: Number(byDay.get(date)?.free_bays ?? 0),
      total_bays: Number(byDay.get(date)?.total_bays ?? 0)
    }))
  });
});

// Operator: generate or top up slots for a date range.
const generate = asyncHandler(async (req, res) => {
  const garage = await assertCanManage(req.params.garageId, req.user);
  const { fromDate, toDate } = req.body;
  if (!fromDate || !toDate) {
    throw new AppError(400, 'fromDate and toDate (YYYY-MM-DD) are required.');
  }
  requireDate(fromDate, 'fromDate');
  requireDate(toDate, 'toDate');
  if (toDate < fromDate) throw new AppError(400, 'toDate cannot be before fromDate.');
  if (fromDate < todayLocalISO()) throw new AppError(400, 'You cannot generate slots for dates that have already passed.');
  if (dateRange(fromDate, toDate).length > 62) throw new AppError(400, 'Please generate at most 62 days at a time.');
  const created = await slotModel.generateForDateRange(garage, fromDate, toDate);
  const message = created === 0
    ? 'These dates are already open, so nothing changed.'
    : `${created} new time ${created === 1 ? 'slot' : 'slots'} opened.`;
  res.status(201).json({ message, created });
});

const remove = asyncHandler(async (req, res) => {
  const slot = await slotModel.findById(req.params.id);
  if (!slot) throw new AppError(404, 'Slot not found.');
  await assertCanManage(slot.garage_id, req.user);
  await slotModel.remove(req.params.id);
  res.status(204).send();
});

module.exports = { listForGarageAndDate, availability, generate, remove };
