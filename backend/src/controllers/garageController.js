const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const garageModel = require('../models/garageModel');
const slotModel = require('../models/slotModel');
const statsModel = require('../models/statsModel');
const { requireIntInRange, requireTime, requireString, optionalString } = require('../utils/validate');

// Makes sure the logged-in operator owns the garage they're trying to modify
// (admins can touch any garage). Shared by every write endpoint.
async function assertCanManage(garageId, user) {
  const garage = await garageModel.findById(garageId);
  if (!garage) throw new AppError(404, 'Garage not found.');
  if (user.role !== 'admin' && garage.operator_id !== user.id) {
    throw new AppError(403, 'You can only manage your own garages.');
  }
  return garage;
}

function requireClosedWeekdays(value) {
  if (typeof value !== 'string' || !/^([0-6](,[0-6])*)?$/.test(value)) {
    throw new AppError(400, 'Closed days must be a comma list of weekday numbers from 0 to 6.');
  }
  return value;
}

// Shared by create and update: checks only the fields that were sent, and
// confirms closing time is after opening time when both are known.
function validateGarageFields(body, existing = {}) {
  if (body.name !== undefined) requireString(body.name, 'Name', 150);
  if (body.address !== undefined) requireString(body.address, 'Address', 255);
  if (body.city !== undefined) requireString(body.city, 'City', 100);
  if (body.description !== undefined) optionalString(body.description, 'Description', 2000);
  if (body.phone !== undefined) optionalString(body.phone, 'Phone', 30);
  if (body.bayCapacity !== undefined) requireIntInRange(body.bayCapacity, 'Bay capacity', 1, 50);
  if (body.slotDurationMinutes !== undefined) requireIntInRange(body.slotDurationMinutes, 'Slot duration', 15, 240);
  if (body.closedWeekdays !== undefined) requireClosedWeekdays(body.closedWeekdays);
  if (body.openingTime !== undefined) body.openingTime = requireTime(body.openingTime, 'Opening time');
  if (body.closingTime !== undefined) body.closingTime = requireTime(body.closingTime, 'Closing time');
  const open = body.openingTime ?? existing.opening_time;
  const close = body.closingTime ?? existing.closing_time;
  if (open && close && close <= open) {
    throw new AppError(400, 'Closing time must be after opening time.');
  }
}

const SORTS = ['rating', 'price', 'soonest', 'name'];

const search = asyncHandler(async (req, res) => {
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const { maxPrice, minRating } = req.query;
  const garages = await garageModel.search({
    includeInactive: req.user?.role === 'admin', // admins must see hidden garages to re-show them
    city: text(req.query.city),
    q: text(req.query.q),
    vehicleType: text(req.query.vehicleType),
    maxPrice: Number(maxPrice) > 0 ? Number(maxPrice) : undefined,
    minRating: Number(minRating) > 0 ? Number(minRating) : undefined,
    sortBy: SORTS.includes(req.query.sortBy) ? req.query.sortBy : 'rating'
  });
  res.json({ garages });
});

const getById = asyncHandler(async (req, res) => {
  const garage = await garageModel.findById(req.params.id);
  if (!garage) throw new AppError(404, 'Garage not found.');
  res.json({ garage });
});

const getMine = asyncHandler(async (req, res) => {
  const garages = await garageModel.findByOperator(req.user.id);
  res.json({ garages });
});

const stats = asyncHandler(async (req, res) => {
  await assertCanManage(req.params.id, req.user);
  res.json({ stats: await statsModel.forGarage(req.params.id) });
});

const create = asyncHandler(async (req, res) => {
  const { name, description, address, city, phone, latitude, longitude, bayCapacity, openingTime, closingTime, slotDurationMinutes, closedWeekdays } = req.body;
  if (!name || !address || !city) {
    throw new AppError(400, 'Name, address and city are required.');
  }
  validateGarageFields(req.body);
  const garage = await garageModel.create({
    operatorId: req.user.id,
    name, description, address, city, phone, latitude, longitude,
    bayCapacity, openingTime: req.body.openingTime, closingTime: req.body.closingTime, slotDurationMinutes, closedWeekdays
  });
  res.status(201).json({ garage });
});

const update = asyncHandler(async (req, res) => {
  const existing = await assertCanManage(req.params.id, req.user);
  validateGarageFields(req.body, existing);
  if (req.body.isVerified !== undefined && req.user.role !== 'admin') {
    throw new AppError(403, 'Only an administrator can verify a garage.');
  }

  const fieldMap = {
    name: 'name', description: 'description', address: 'address', city: 'city', phone: 'phone',
    latitude: 'latitude', longitude: 'longitude', bayCapacity: 'bay_capacity',
    openingTime: 'opening_time', closingTime: 'closing_time',
    slotDurationMinutes: 'slot_duration_minutes', closedWeekdays: 'closed_weekdays',
    isActive: 'is_active', isVerified: 'is_verified'
  };
  const dbFields = {};
  for (const [bodyKey, dbKey] of Object.entries(fieldMap)) {
    if (req.body[bodyKey] !== undefined) dbFields[dbKey] = req.body[bodyKey];
  }

  const garage = await garageModel.update(req.params.id, dbFields);

  // Settings only matter if the bookable slots follow them.
  const gridChanged = ['opening_time', 'closing_time', 'slot_duration_minutes', 'closed_weekdays']
    .some((key) => String(garage[key]) !== String(existing[key]));
  if (Number(garage.bay_capacity) !== Number(existing.bay_capacity)) {
    await slotModel.syncFutureCapacity(garage.id, garage.bay_capacity);
  }
  if (gridChanged) await slotModel.rebuildFutureSlots(garage);

  res.json({ garage });
});

const remove = asyncHandler(async (req, res) => {
  await assertCanManage(req.params.id, req.user);
  await garageModel.remove(req.params.id);
  res.status(204).send();
});

module.exports = { search, getById, getMine, stats, create, update, remove, assertCanManage };
