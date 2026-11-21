const pool = require('../config/db');

// Public list: hidden reviews are left out, and each one carries what the
// customer actually had done, which is what makes it credible to a reader.
async function findByGarage(garageId) {
  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.created_at, u.name AS customer_name,
            s.name AS service_name, sl.slot_date AS service_date
     FROM reviews r
     JOIN users u ON u.id = r.customer_id
     JOIN bookings b ON b.id = r.booking_id
     JOIN services s ON s.id = b.service_id
     JOIN slots sl ON sl.id = b.slot_id
     WHERE r.garage_id = ? AND r.is_hidden = FALSE
     ORDER BY r.created_at DESC, r.id DESC`,
    [garageId]
  );
  return rows;
}

async function findByBooking(bookingId) {
  const [rows] = await pool.query('SELECT * FROM reviews WHERE booking_id = ?', [bookingId]);
  return rows[0] || null;
}

async function create({ bookingId, garageId, customerId, rating, comment }) {
  const [result] = await pool.query(
    'INSERT INTO reviews (booking_id, garage_id, customer_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
    [bookingId, garageId, customerId, rating, comment || null]
  );
  const [rows] = await pool.query('SELECT * FROM reviews WHERE id = ?', [result.insertId]);
  return rows[0];
}

async function findAllForModeration() {
  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.comment, r.is_hidden, r.hidden_reason, r.created_at,
            u.name AS customer_name, g.name AS garage_name
     FROM reviews r
     JOIN users u ON u.id = r.customer_id
     JOIN garages g ON g.id = r.garage_id
     ORDER BY r.is_hidden ASC, r.created_at DESC, r.id DESC`
  );
  return rows;
}

async function setHidden(id, hidden, reason) {
  const [result] = await pool.query(
    'UPDATE reviews SET is_hidden = ?, hidden_reason = ? WHERE id = ?',
    [hidden, hidden ? reason : null, id]
  );
  return result.affectedRows === 1;
}

module.exports = { findByGarage, findByBooking, create, findAllForModeration, setHidden };
