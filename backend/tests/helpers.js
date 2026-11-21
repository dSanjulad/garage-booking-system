// Shared setup for the API test suites. Every test creates its own
// operator, garage, customers and slots with unique emails, so tests never
// depend on seed data and can be re-run any number of times against the
// same database.
process.env.TZ = process.env.TZ || 'Asia/Colombo';
require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');

const BASE_URL = process.env.API_URL || 'http://localhost:8081/api';
const api = axios.create({ baseURL: BASE_URL, validateStatus: () => true });
const db = mysql.createPool({
  multipleStatements: false,
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'garage_booking_db',
  dateStrings: true
});

let counter = 0;
const RUN = Date.now();
const uniq = () => `${RUN}-${++counter}-${Math.floor(Math.random() * 1e6)}`;
const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// Local-date helpers (match what the server uses).
function isoLocal(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function register(role = 'owner') {
  const email = `t-${role}-${uniq()}@test.local`;
  const res = await api.post('/auth/register', { name: `Test ${role}`, email, password: 'password123', role });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.data)}`);
  return { token: res.data.token, id: res.data.user.id, email };
}

// Operator + garage + one service + generated slots on a future date.
// Defaults give 3 one-hour slots (09:00, 10:00, 11:00) per day.
async function setupGarage({ serviceMinutes = 30, bayCapacity = 1, openingTime = '09:00:00', closingTime = '12:00:00', slotDurationMinutes = 60, daysAhead = 3 } = {}) {
  const operator = await register('operator');
  const g = await api.post('/garages', {
    name: `Test Garage ${uniq()}`, address: '1 Test Lane', city: 'Colombo',
    bayCapacity, openingTime, closingTime, slotDurationMinutes
  }, auth(operator.token));
  if (g.status !== 201) throw new Error(`garage failed: ${JSON.stringify(g.data)}`);
  const garageId = g.data.garage.id;
  const s = await api.post(`/garages/${garageId}/services`, { name: 'Test Service', price: 1000, durationMinutes: serviceMinutes }, auth(operator.token));
  const serviceId = s.data.service.id;
  const date = isoLocal(daysAhead);
  await api.post(`/garages/${garageId}/slots/generate`, { fromDate: date, toDate: date }, auth(operator.token));
  const slots = (await api.get(`/garages/${garageId}/slots`, { params: { date } })).data.slots;
  return { operator, garageId, serviceId, date, slots };
}

// What the database itself says about a slot: the stored counter, the
// number of confirmed bookings actually pointing at it, and its capacity.
// The core invariant of the system is  booked_count == confirmed <= capacity.
async function slotState(slotId) {
  const [[row]] = await db.query(
    `SELECT s.capacity, s.booked_count,
            (SELECT COUNT(*) FROM booking_slots bs JOIN bookings b ON b.id = bs.booking_id
              WHERE bs.slot_id = s.id AND b.status = 'confirmed') AS confirmed
     FROM slots s WHERE s.id = ?`, [slotId]);
  return row;
}

// Simulate the passage of time: move a slot into the past.
async function moveSlotToPast(slotId) {
  const past = isoLocal(-(30 + Math.floor(Math.random() * 3000)));
  await db.query('UPDATE slots SET slot_date = ? WHERE id = ?', [past, slotId]);
}

module.exports = { api, db, auth, uniq, isoLocal, register, setupGarage, slotState, moveSlotToPast };
