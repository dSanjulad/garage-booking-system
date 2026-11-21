const AppError = require('./AppError');

// Small, dependency-free input checks. Each throws a 400 AppError with a
// message the UI can show directly, so bad input never reaches the
// database and surfaces as a generic 500.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireEmail(value) {
  if (typeof value !== 'string' || !EMAIL_RE.test(value.trim())) {
    throw new AppError(400, 'Please enter a valid email address.');
  }
}

function requireIntInRange(value, field, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new AppError(400, `${field} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

function requireNumberInRange(value, field, min, max) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n) || n < min || n > max) {
    throw new AppError(400, `${field} must be a number between ${min} and ${max}.`);
  }
  return n;
}

function requireTime(value, field) {
  if (typeof value !== 'string' || !TIME_RE.test(value)) {
    throw new AppError(400, `${field} must be a time like 08:00 or 08:00:00.`);
  }
  return value.length === 5 ? `${value}:00` : value;
}

function requireDate(value, field) {
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new AppError(400, `${field} must be a date in YYYY-MM-DD format.`);
  }
  return value;
}

function requireString(value, field, max = 255) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(400, `${field} is required.`);
  }
  if (value.length > max) {
    throw new AppError(400, `${field} must be ${max} characters or fewer.`);
  }
  return value.trim();
}

// Same check for optional fields: absent is fine, anything else must be text.
function optionalString(value, field, max = 255) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new AppError(400, `${field} must be text.`);
  if (value.length > max) throw new AppError(400, `${field} must be ${max} characters or fewer.`);
  return value.trim();
}

// An id from a request body. mysql2's query() expands objects passed as
// parameters, so ids must be proven to be plain integers before use.
function requireId(value, field) {
  const n = Number(value);
  if (typeof value === 'object' || !Number.isInteger(n) || n < 1) {
    throw new AppError(400, `${field} must be a valid id.`);
  }
  return n;
}

const VEHICLE_TYPES = ['car', 'suv', 'van', 'motorcycle', 'three_wheeler', 'lorry'];

function requireVehicleType(value) {
  if (!VEHICLE_TYPES.includes(value)) {
    throw new AppError(400, `Vehicle type must be one of: ${VEHICLE_TYPES.join(', ')}.`);
  }
  return value;
}

module.exports = { VEHICLE_TYPES, requireString, optionalString, requireId, requireVehicleType, requireEmail, requireIntInRange, requireNumberInRange, requireTime, requireDate };
