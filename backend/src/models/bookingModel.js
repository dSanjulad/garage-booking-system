const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { todayLocalISO, slotHasStarted, slotsNeeded, slotLengthMinutes, consecutiveRun } = require('../utils/timeSlots');

const { withTransaction } = pool;

/*
 * Booking integrity (RQ3 / Objective 4).
 *
 * Without locking, two customers could both read "1 bay left", both pass the
 * check and both insert. Here every slot a booking will occupy is locked with
 * SELECT ... FOR UPDATE before its counter is read, so competing transactions
 * for the same slot run one at a time. Others are unaffected.
 *
 * A service longer than one slot occupies several slots, and each one needs a
 * free bay. Without that, a 2-hour job in a 1-hour grid would hold its bay for
 * only the first hour and the bay would be sold again for the second.
 *
 * Slots are always locked in ascending id order, so two transactions wanting
 * overlapping sets of slots can never wait on each other in a cycle. The CHECK
 * constraint on slots is the final guard: even a bug here could not oversell.
 */

// The slots a service would occupy if it started in `startSlot`, unlocked.
async function planRun(conn, startSlot, service) {
  const needed = slotsNeeded(service.duration_minutes, slotLengthMinutes(startSlot));
  const [rows] = await conn.query(
    `SELECT id, start_time, end_time FROM slots
     WHERE garage_id = ? AND slot_date = ? AND start_time >= ?
     ORDER BY start_time LIMIT ?`,
    [startSlot.garage_id, startSlot.slot_date, startSlot.start_time, needed]
  );
  const run = consecutiveRun(rows, 0, needed);
  if (!run) {
    throw new AppError(409, `${service.name} takes ${service.duration_minutes} minutes, which doesn't fit from this start time. Please pick an earlier slot or another day.`);
  }
  return run.map((s) => s.id);
}

async function lockSlots(conn, ids) {
  const [rows] = await conn.query('SELECT * FROM slots WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
  return rows;
}

// Any other live booking by this customer overlapping these slots? Safe from
// races because the caller already holds the locks on these slots.
async function customerHasOverlap(conn, customerId, slotIds, excludeBookingId = 0) {
  const [rows] = await conn.query(
    `SELECT b.id FROM booking_slots bs
     JOIN bookings b ON b.id = bs.booking_id
     WHERE bs.slot_id IN (?) AND b.customer_id = ? AND b.status = 'confirmed' AND b.id <> ?
     LIMIT 1`,
    [slotIds, customerId, excludeBookingId]
  );
  return rows.length > 0;
}

/*
 * Mandatory reviews. A customer whose earlier booking was completed must review
 * it before making another. The check runs inside the booking transaction, so it
 * holds however the request arrives. A review an admin later hides still counts
 * as given, so moderation can never lock a customer out of booking. Set
 * REVIEW_REQUIRED=false to turn the rule off.
 */
const reviewRequired = () => process.env.REVIEW_REQUIRED !== 'false';

async function findPendingReviews(db, customerId) {
  const [rows] = await db.query(
    `SELECT b.id AS booking_id, b.garage_id, g.name AS garage_name, s.name AS service_name,
            sl.slot_date, sl.start_time
     FROM bookings b
     JOIN garages g ON g.id = b.garage_id
     JOIN services s ON s.id = b.service_id
     JOIN slots sl ON sl.id = b.slot_id
     LEFT JOIN reviews r ON r.booking_id = b.id
     WHERE b.customer_id = ? AND b.status = 'completed' AND r.id IS NULL
     ORDER BY sl.slot_date, sl.start_time`,
    [customerId]
  );
  return rows;
}

async function createBooking({ slotId, serviceId, customerId, notes, vehicleType, vehicleDetails }) {
  const bookingId = await withTransaction(async (conn) => {
    if (reviewRequired()) {
      const pending = await findPendingReviews(conn, customerId);
      if (pending.length) {
        const first = pending[0];
        throw new AppError(
          409,
          `Please review your completed ${first.service_name} at ${first.garage_name} before booking again. Reviews help other drivers choose a garage.`,
          { code: 'REVIEW_REQUIRED', pending }
        );
      }
    }
    const [[startSlot]] = await conn.query('SELECT * FROM slots WHERE id = ?', [slotId]);
    if (!startSlot) throw new AppError(404, 'That time slot no longer exists.');

    const [[service]] = await conn.query(
      'SELECT * FROM services WHERE id = ? AND garage_id = ? AND is_active = TRUE',
      [serviceId, startSlot.garage_id]
    );
    if (!service) throw new AppError(400, 'That service is not offered by this garage.');
    if (!service.vehicle_types.split(',').includes(vehicleType)) {
      throw new AppError(400, `${service.name} isn't offered for this vehicle type.`);
    }
    if (slotHasStarted(startSlot.slot_date, startSlot.start_time)) {
      throw new AppError(400, 'That time has already passed. Please pick a future slot.');
    }

    const runIds = await planRun(conn, startSlot, service);
    const locked = await lockSlots(conn, runIds);

    // Re-checked after locking: only values read under the lock can be trusted.
    if (locked.length !== runIds.length) throw new AppError(409, 'That time slot no longer exists.');
    if (locked.some((s) => s.booked_count >= s.capacity)) {
      throw new AppError(409, 'Sorry, that slot was just fully booked. Please pick another time.');
    }
    if (await customerHasOverlap(conn, customerId, runIds)) {
      throw new AppError(409, 'You already have a booking at this time.');
    }

    await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id IN (?)', [runIds]);
    const [result] = await conn.query(
      `INSERT INTO bookings (garage_id, service_id, slot_id, customer_id, vehicle_type, vehicle_details, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [startSlot.garage_id, serviceId, slotId, customerId, vehicleType, vehicleDetails || null, notes || null]
    );
    await conn.query('INSERT INTO booking_slots (booking_id, slot_id) VALUES ?', [runIds.map((id) => [result.insertId, id])]);
    await logEvent(conn, result.insertId, 'booked');
    return result.insertId;
  });
  return findById(bookingId);
}

const DETAIL_SELECT = `
  SELECT
    b.id, b.status, b.job_stage, b.completed_by, b.notes, b.vehicle_type, b.vehicle_details,
    b.created_at, b.updated_at,
    b.customer_id, cu.name AS customer_name, cu.email AS customer_email, cu.phone AS customer_phone,
    b.garage_id, g.name AS garage_name, g.address AS garage_address, g.city AS garage_city, g.operator_id,
    op.email AS operator_email,
    b.service_id, s.name AS service_name, s.price AS service_price, s.price_type, s.duration_minutes,
    b.slot_id, sl.slot_date, sl.start_time,
    (SELECT MAX(sx.end_time) FROM booking_slots bx JOIN slots sx ON sx.id = bx.slot_id WHERE bx.booking_id = b.id) AS end_time,
    EXISTS (SELECT 1 FROM reviews rv WHERE rv.booking_id = b.id) AS has_review,
    (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.booking_id = b.id AND p.status = 'paid') AS amount_paid
  FROM bookings b
  JOIN users cu ON cu.id = b.customer_id
  JOIN garages g ON g.id = b.garage_id
  JOIN users op ON op.id = g.operator_id
  JOIN services s ON s.id = b.service_id
  JOIN slots sl ON sl.id = b.slot_id
`;

async function findById(id) {
  const [rows] = await pool.query(`${DETAIL_SELECT} WHERE b.id = ?`, [id]);
  return rows[0] || null;
}

async function findByCustomer(customerId) {
  const [rows] = await pool.query(
    `${DETAIL_SELECT} WHERE b.customer_id = ? ORDER BY sl.slot_date DESC, sl.start_time DESC`,
    [customerId]
  );
  return rows;
}

async function findByGarage(garageId) {
  const [rows] = await pool.query(
    `${DETAIL_SELECT} WHERE b.garage_id = ? ORDER BY sl.slot_date DESC, sl.start_time DESC`,
    [garageId]
  );
  return rows;
}

async function findEvents(bookingId) {
  const [rows] = await pool.query(
    'SELECT event, note, created_at FROM booking_events WHERE booking_id = ? ORDER BY id',
    [bookingId]
  );
  return rows;
}

async function logEvent(conn, bookingId, event, note = null) {
  await conn.query('INSERT INTO booking_events (booking_id, event, note) VALUES (?, ?, ?)', [bookingId, event, note]);
}

async function occupiedSlotIds(conn, bookingId) {
  const [rows] = await conn.query('SELECT slot_id FROM booking_slots WHERE booking_id = ?', [bookingId]);
  return rows.map((r) => r.slot_id);
}

async function lockConfirmedBooking(conn, id, verb) {
  const [[booking]] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]);
  if (!booking) throw new AppError(404, 'Booking not found.');
  if (booking.status !== 'confirmed') {
    throw new AppError(409, `This booking is already ${booking.status.replace('_', '-')} and cannot be ${verb}.`);
  }
  return booking;
}

// Cancelling frees every occupied slot and flags any paid amount for refund,
// in one transaction, so it can't race a new booking on the same slots.
async function cancelBooking(id) {
  await withTransaction(async (conn) => {
    await lockConfirmedBooking(conn, id, 'cancelled');
    const slotIds = await occupiedSlotIds(conn, id);
    await lockSlots(conn, slotIds);
    await conn.query("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [id]);
    await conn.query('UPDATE slots SET booked_count = booked_count - 1 WHERE id IN (?)', [slotIds]);
    await conn.query(
      `UPDATE payments SET status = IF(provider = 'simulated', 'refunded', 'refund_due')
       WHERE booking_id = ? AND status = 'paid'`,
      [id]
    );
    await conn.query("UPDATE payments SET status = 'failed' WHERE booking_id = ? AND status = 'pending'", [id]);
    await logEvent(conn, id, 'cancelled');
  });
  return findById(id);
}

/*
 * Moves a confirmed booking to another start time at the same garage: the bays
 * are released and claimed in one transaction, or nothing changes. The old and
 * new slot sets may overlap, so only slots that are actually new need a free bay.
 */
async function rescheduleBooking(id, newSlotId) {
  await withTransaction(async (conn) => {
    const booking = await lockConfirmedBooking(conn, id, 'rescheduled');
    if (newSlotId === booking.slot_id) throw new AppError(400, 'That is already the booked slot.');

    const [[startSlot]] = await conn.query('SELECT * FROM slots WHERE id = ?', [newSlotId]);
    if (!startSlot) throw new AppError(404, 'The requested slot no longer exists.');
    if (startSlot.garage_id !== booking.garage_id) {
      throw new AppError(400, 'You can only reschedule within the same garage.');
    }
    if (slotHasStarted(startSlot.slot_date, startSlot.start_time)) {
      throw new AppError(400, 'That time has already passed. Please pick a future slot.');
    }

    const [[service]] = await conn.query('SELECT * FROM services WHERE id = ?', [booking.service_id]);
    const newIds = await planRun(conn, startSlot, service);
    const oldIds = await occupiedSlotIds(conn, id);
    const locked = await lockSlots(conn, [...new Set([...oldIds, ...newIds])]);

    const toClaim = newIds.filter((slotId) => !oldIds.includes(slotId));
    const toRelease = oldIds.filter((slotId) => !newIds.includes(slotId));
    const claiming = locked.filter((s) => toClaim.includes(s.id));
    if (claiming.length !== toClaim.length) throw new AppError(404, 'The requested slot no longer exists.');
    if (claiming.some((s) => s.booked_count >= s.capacity)) {
      throw new AppError(409, 'That slot is fully booked. Please choose another.');
    }
    if (await customerHasOverlap(conn, booking.customer_id, newIds, id)) {
      throw new AppError(409, 'You already have a booking at that time.');
    }

    if (toRelease.length) await conn.query('UPDATE slots SET booked_count = booked_count - 1 WHERE id IN (?)', [toRelease]);
    if (toClaim.length) await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id IN (?)', [toClaim]);
    await conn.query('DELETE FROM booking_slots WHERE booking_id = ?', [id]);
    await conn.query('INSERT INTO booking_slots (booking_id, slot_id) VALUES ?', [newIds.map((slotId) => [id, slotId])]);
    // A new time needs a new reminder.
    await conn.query("UPDATE bookings SET slot_id = ?, reminder_sent_at = NULL, job_stage = 'scheduled' WHERE id = ?", [newSlotId, id]);
    await logEvent(conn, id, 'rescheduled');
  });
  return findById(id);
}

// Completed or no-show only make sense once the appointment time has arrived,
// so an operator can't complete a future booking and unlock a review for a
// service that never happened. One exception: a job already in service or
// ready to collect is physically under way (the tracker only opens on the day
// of the appointment), so finishing ahead of the booked time is allowed.
// A no-show always needs the time to have passed.
async function finishBooking(id, status, completedBy) {
  await withTransaction(async (conn) => {
    const booking = await lockConfirmedBooking(conn, id, 'updated');
    const [[start]] = await conn.query(
      `SELECT sl.slot_date, sl.start_time FROM bookings b JOIN slots sl ON sl.id = b.slot_id WHERE b.id = ?`,
      [id]
    );
    const workUnderway = status === 'completed' && ['in_service', 'ready'].includes(booking.job_stage);
    if (!slotHasStarted(start.slot_date, start.start_time) && !workUnderway) {
      throw new AppError(409, status === 'completed'
        ? 'You can mark this completed once the appointment time has started, or once the job is in service.'
        : 'You can only mark a no-show once the appointment time has started.');
    }
    await conn.query(
      'UPDATE bookings SET status = ?, completed_by = ?, job_stage = IF(? = \'completed\', \'finished\', job_stage) WHERE id = ?',
      [status, status === 'completed' ? completedBy : null, status, id]
    );
    await logEvent(conn, id, status, completedBy === 'customer' ? 'Confirmed by the customer' : null);
  });
  return findById(id);
}

async function setStatus(id, status) {
  if (!['completed', 'no_show'].includes(status)) {
    throw new AppError(400, `Invalid status: ${status}`);
  }
  return finishBooking(id, status, 'operator');
}

// Service tracker: stages only move forward, and only once the appointment
// day has arrived, because a car can't be in the workshop before that.
const STAGES = ['scheduled', 'received', 'in_service', 'ready'];

async function advanceStage(id, stage, note) {
  if (!STAGES.includes(stage) || stage === 'scheduled') {
    throw new AppError(400, 'Stage must be one of: received, in_service, ready.');
  }
  await withTransaction(async (conn) => {
    const booking = await lockConfirmedBooking(conn, id, 'updated');
    const [[start]] = await conn.query('SELECT sl.slot_date FROM slots sl WHERE sl.id = ?', [booking.slot_id]);
    if (start.slot_date > todayLocalISO()) {
      throw new AppError(409, 'The service tracker opens on the day of the appointment.');
    }
    if (STAGES.indexOf(stage) <= STAGES.indexOf(booking.job_stage)) {
      throw new AppError(409, 'This job has already reached that stage.');
    }
    await conn.query('UPDATE bookings SET job_stage = ? WHERE id = ?', [stage, id]);
    await logEvent(conn, id, stage, note || null);
  });
  return findById(id);
}

// Claims a reminder atomically, so overlapping runs can't send it twice.
async function claimReminder(id) {
  const [result] = await pool.query(
    'UPDATE bookings SET reminder_sent_at = NOW() WHERE id = ? AND reminder_sent_at IS NULL',
    [id]
  );
  return result.affectedRows === 1;
}

async function releaseReminder(id) {
  await pool.query('UPDATE bookings SET reminder_sent_at = NULL WHERE id = ?', [id]);
}

// Confirmed bookings starting between the two local datetimes, not yet reminded.
async function findDueReminders(fromDateTime, toDateTime) {
  const [rows] = await pool.query(
    `${DETAIL_SELECT}
     WHERE b.status = 'confirmed' AND b.reminder_sent_at IS NULL
       AND TIMESTAMP(sl.slot_date, sl.start_time) > ?
       AND TIMESTAMP(sl.slot_date, sl.start_time) <= ?`,
    [fromDateTime, toDateTime]
  );
  return rows;
}

module.exports = {
  createBooking, findPendingReviews, findById, findByCustomer, findByGarage, findEvents, cancelBooking,
  rescheduleBooking, setStatus, finishBooking, advanceStage, claimReminder, releaseReminder, findDueReminders
};
