const crypto = require('crypto');
const pool = require('../config/db');
const AppError = require('../utils/AppError');

const { withTransaction } = pool;

function depositAmount(price) {
  const percent = Number(process.env.DEPOSIT_PERCENT) || 20;
  return Math.round(Number(price) * percent) / 100;
}

// Works out what is owed from the database, never from the request. The booking
// row is locked so a double click can't create two payments for the same amount.
async function startPayment({ bookingId, customerId, paymentType, providerName }) {
  return withTransaction(async (conn) => {
    const [[booking]] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
    if (!booking) throw new AppError(404, 'Booking not found.');
    if (booking.customer_id !== customerId) throw new AppError(403, 'You can only pay for your own bookings.');
    if (booking.status !== 'confirmed' && booking.status !== 'completed') {
      throw new AppError(409, 'This booking is no longer active, so it cannot be paid.');
    }

    const [[service]] = await conn.query('SELECT price, price_type FROM services WHERE id = ?', [booking.service_id]);
    if (service.price_type === 'inspection') {
      throw new AppError(409, 'This price is set after inspection, so it is paid at the garage.');
    }

    const [[{ paid }]] = await conn.query(
      "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE booking_id = ? AND status = 'paid'",
      [bookingId]
    );
    const outstanding = Math.round((Number(service.price) - Number(paid)) * 100) / 100;
    if (outstanding <= 0) throw new AppError(409, 'This booking is already paid in full.');
    if (paymentType === 'deposit' && Number(paid) > 0) {
      throw new AppError(409, 'A deposit has already been paid on this booking.');
    }

    // Reuse an unfinished attempt of the same kind rather than piling them up.
    const amount = paymentType === 'deposit' ? depositAmount(service.price) : outstanding;
    const [[pending]] = await conn.query(
      "SELECT * FROM payments WHERE booking_id = ? AND status = 'pending' AND payment_type = ? AND amount = ? AND provider = ? LIMIT 1",
      [bookingId, paymentType, amount, providerName]
    );
    if (pending) return pending;
    await conn.query("UPDATE payments SET status = 'failed' WHERE booking_id = ? AND status = 'pending'", [bookingId]);

    const orderRef = `GB${bookingId}-${crypto.randomBytes(6).toString('hex')}`;
    const [result] = await conn.query(
      'INSERT INTO payments (booking_id, provider, payment_type, amount, order_ref) VALUES (?, ?, ?, ?, ?)',
      [bookingId, providerName, paymentType, amount, orderRef]
    );
    const [[payment]] = await conn.query('SELECT * FROM payments WHERE id = ?', [result.insertId]);
    return payment;
  });
}

// Moves a pending payment to its final state, exactly once. A gateway may send
// the same notification twice; only the first one changes anything.
async function settle(paymentId, status, providerRef = null) {
  return withTransaction(async (conn) => {
    const [[payment]] = await conn.query('SELECT * FROM payments WHERE id = ? FOR UPDATE', [paymentId]);
    if (!payment) throw new AppError(404, 'Payment not found.');
    if (payment.status !== 'pending') return payment;
    await conn.query(
      'UPDATE payments SET status = ?, provider_ref = ?, paid_at = IF(? = \'paid\', NOW(), NULL) WHERE id = ?',
      [status, providerRef, status, paymentId]
    );
    const [[updated]] = await conn.query('SELECT * FROM payments WHERE id = ?', [paymentId]);
    return updated;
  });
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [id]);
  return rows[0] || null;
}

async function findByOrderRef(orderRef) {
  const [rows] = await pool.query('SELECT * FROM payments WHERE order_ref = ?', [orderRef]);
  return rows[0] || null;
}

async function findByBooking(bookingId) {
  const [rows] = await pool.query('SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC', [bookingId]);
  return rows;
}

module.exports = { depositAmount, startPayment, settle, findById, findByOrderRef, findByBooking };
