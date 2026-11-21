const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const serviceModel = require('../models/serviceModel');
const { assertCanManage } = require('./garageController');
const { requireNumberInRange, requireIntInRange, requireString, optionalString, requireVehicleType } = require('../utils/validate');

const PRICE_TYPES = ['fixed', 'starting_from', 'inspection'];

function checkPricing(body) {
  if (body.price !== undefined) requireNumberInRange(body.price, 'Price', 0, 10000000);
  if (body.durationMinutes !== undefined) requireIntInRange(body.durationMinutes, 'Duration', 5, 600);
  if (body.priceType !== undefined && !PRICE_TYPES.includes(body.priceType)) {
    throw new AppError(400, `Price type must be one of: ${PRICE_TYPES.join(', ')}.`);
  }
  if (body.vehicleTypes !== undefined) {
    if (!Array.isArray(body.vehicleTypes) || body.vehicleTypes.length === 0) {
      throw new AppError(400, 'Choose at least one vehicle type.');
    }
    body.vehicleTypes.forEach(requireVehicleType);
  }
}

const listForGarage = asyncHandler(async (req, res) => {
  const services = await serviceModel.findByGarage(req.params.garageId);
  res.json({ services });
});

// Operators also need to see services they have hidden.
const listAllForGarage = asyncHandler(async (req, res) => {
  await assertCanManage(req.params.garageId, req.user);
  const services = await serviceModel.findByGarage(req.params.garageId, { includeInactive: true });
  res.json({ services });
});

const create = asyncHandler(async (req, res) => {
  await assertCanManage(req.params.garageId, req.user);
  const { name, description, price, priceType, vehicleTypes, durationMinutes } = req.body;
  if (!name || price === undefined) {
    throw new AppError(400, 'Name and price are required.');
  }
  requireString(name, 'Name', 150);
  optionalString(description, 'Description', 2000);
  checkPricing(req.body);
  const service = await serviceModel.create({
    garageId: req.params.garageId, name, description, price, priceType,
    vehicleTypes: vehicleTypes ? vehicleTypes.join(',') : undefined, durationMinutes
  });
  res.status(201).json({ service });
});

const update = asyncHandler(async (req, res) => {
  const service = await serviceModel.findById(req.params.id);
  if (!service) throw new AppError(404, 'Service not found.');
  await assertCanManage(service.garage_id, req.user);
  if (req.body.name !== undefined) requireString(req.body.name, 'Name', 150);
  if (req.body.description !== undefined) optionalString(req.body.description, 'Description', 2000);
  checkPricing(req.body);

  const dbFields = {};
  const fieldMap = { name: 'name', description: 'description', price: 'price', priceType: 'price_type', durationMinutes: 'duration_minutes', isActive: 'is_active' };
  for (const [bodyKey, dbKey] of Object.entries(fieldMap)) {
    if (req.body[bodyKey] !== undefined) dbFields[dbKey] = req.body[bodyKey];
  }
  if (req.body.vehicleTypes !== undefined) dbFields.vehicle_types = req.body.vehicleTypes.join(',');
  const updated = await serviceModel.update(req.params.id, dbFields);
  res.json({ service: updated });
});

const remove = asyncHandler(async (req, res) => {
  const service = await serviceModel.findById(req.params.id);
  if (!service) throw new AppError(404, 'Service not found.');
  await assertCanManage(service.garage_id, req.user);
  await serviceModel.remove(req.params.id);
  res.status(204).send();
});

module.exports = { listForGarage, listAllForGarage, create, update, remove };
