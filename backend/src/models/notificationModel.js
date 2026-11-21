const pool = require('../config/db');

async function record({ bookingId, kind, channel, recipient, subject, status, detail }) {
  await pool.query(
    `INSERT INTO notifications (booking_id, kind, channel, recipient, subject, status, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [bookingId || null, kind, channel, recipient || null, subject ? subject.slice(0, 255) : null, status, detail ? String(detail).slice(0, 255) : null]
  );
}

async function findRecent(limit = 100) {
  const [rows] = await pool.query('SELECT * FROM notifications ORDER BY id DESC LIMIT ?', [limit]);
  return rows;
}

module.exports = { record, findRecent };
