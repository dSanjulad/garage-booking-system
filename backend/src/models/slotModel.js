const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { buildSlotBoundaries, dateRange, isClosedOn, todayLocalISO } = require('../utils/timeSlots');

// Generates or tops up slots from the garage's hours, slot length and bays.
// Safe to call repeatedly: existing slots keep their bookings, and a new slot
// that would overlap a kept slot (after the hours or slot length changed) is
// skipped, because overlapping slots would double the garage's real capacity.
async function generateForDateRange(garage, fromDate, toDate) {
  const boundaries = buildSlotBoundaries(garage.opening_time, garage.closing_time, garage.slot_duration_minutes);
  if (boundaries.length === 0) {
    throw new AppError(400, 'These opening hours are too short for even one slot of this length.');
  }

  const [existing] = await pool.query(
    'SELECT slot_date, start_time, end_time FROM slots WHERE garage_id = ? AND slot_date BETWEEN ? AND ?',
    [garage.id, fromDate, toDate]
  );
  const overlapsExisting = (date, b) => existing.some((s) =>
    s.slot_date === date && s.start_time < b.endTime && s.end_time > b.startTime);

  const values = [];
  for (const date of dateRange(fromDate, toDate)) {
    if (isClosedOn(date, garage.closed_weekdays)) continue;
    for (const b of boundaries) {
      if (!overlapsExisting(date, b)) {
        values.push([garage.id, date, b.startTime, b.endTime, garage.bay_capacity]);
      }
    }
  }
  if (values.length === 0) return 0;

  const [result] = await pool.query(
    'INSERT IGNORE INTO slots (garage_id, slot_date, start_time, end_time, capacity) VALUES ?',
    [values]
  );
  return result.affectedRows;
}

async function findByGarageAndDate(garageId, date) {
  const [rows] = await pool.query(
    `SELECT id, garage_id, slot_date, start_time, end_time, capacity, booked_count,
            (capacity - booked_count) AS available_count
     FROM slots
     WHERE garage_id = ? AND slot_date = ?
     ORDER BY start_time`,
    [garageId, date]
  );
  return rows;
}

// Free bay-periods per day, for the customer's date strip.
async function availabilityByDay(garageId, fromDate, toDate, nowTime) {
  const [rows] = await pool.query(
    `SELECT slot_date,
            SUM(capacity - booked_count) AS free_bays,
            SUM(capacity) AS total_bays
     FROM slots
     WHERE garage_id = ? AND slot_date BETWEEN ? AND ?
       AND (slot_date > ? OR start_time > ?)
     GROUP BY slot_date
     ORDER BY slot_date`,
    [garageId, fromDate, toDate, fromDate, nowTime]
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM slots WHERE id = ?', [id]);
  return rows[0] || null;
}

async function remove(id) {
  const slot = await findById(id);
  if (!slot) throw new AppError(404, 'Slot not found.');
  const [[used]] = await pool.query(
    `SELECT (EXISTS (SELECT 1 FROM booking_slots WHERE slot_id = ?)
          OR EXISTS (SELECT 1 FROM bookings WHERE slot_id = ?)) AS used`,
    [id, id]
  );
  if (slot.booked_count > 0 || used.used) {
    throw new AppError(409, 'This slot has bookings against it and cannot be deleted.');
  }
  await pool.query('DELETE FROM slots WHERE id = ?', [id]);
}

// Bays changed: future slots follow, but never drop below what is already sold.
async function syncFutureCapacity(garageId, capacity) {
  await pool.query(
    'UPDATE slots SET capacity = GREATEST(?, booked_count) WHERE garage_id = ? AND slot_date >= ?',
    [capacity, garageId, todayLocalISO()]
  );
}

// Hours or slot length changed: rebuild every future slot nobody has ever
// booked, so the grid matches the new settings. Slots tied to a booking stay.
async function rebuildFutureSlots(garage) {
  const today = todayLocalISO();
  const [[range]] = await pool.query(
    'SELECT MAX(slot_date) AS last_date FROM slots WHERE garage_id = ? AND slot_date >= ?',
    [garage.id, today]
  );
  await pool.query(
    `DELETE s FROM slots s
     WHERE s.garage_id = ? AND s.slot_date >= ? AND s.booked_count = 0
       AND NOT EXISTS (SELECT 1 FROM booking_slots bs WHERE bs.slot_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.slot_id = s.id)`,
    [garage.id, today]
  );
  if (range.last_date) await generateForDateRange(garage, today, range.last_date);
}

module.exports = { generateForDateRange, findByGarageAndDate, availabilityByDay, findById, remove, syncFutureCapacity, rebuildFutureSlots };
