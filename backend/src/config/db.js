const mysql = require('mysql2/promise');
require('dotenv').config();

// A shared connection pool, so concurrent requests each get a connection
// of their own. That is what makes row locking meaningful under real load.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'garage_booking_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true // return DATE/TIME columns as plain strings, not JS Date objects
});

const ER_LOCK_DEADLOCK = 1213;

/*
 * Runs `work(conn)` in one transaction and commits, or rolls back on any error.
 *
 * READ COMMITTED matters here. Under MySQL's default REPEATABLE READ, the first
 * plain SELECT freezes a snapshot, so a later plain SELECT could miss a booking
 * another transaction committed while this one waited for a lock. With READ
 * COMMITTED every SELECT sees the latest committed data; the FOR UPDATE row
 * locks are what serialise competing writers.
 *
 * Locks are always taken in the same order, so deadlocks should not occur. If
 * InnoDB still picks this transaction as a deadlock victim, nothing has been
 * written, so it is safe to retry.
 */
async function withTransaction(work, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    const conn = await pool.getConnection();
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (err) {
      try { await conn.rollback(); } catch { /* connection already closed */ }
      if (err.errno !== ER_LOCK_DEADLOCK || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 30));
    } finally {
      conn.release();
    }
  }
}

module.exports = pool;
module.exports.withTransaction = withTransaction;
