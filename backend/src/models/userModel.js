const pool = require('../config/db');

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function create({ name, email, passwordHash, phone, role }) {
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
    [name, email, passwordHash, phone || null, role]
  );
  return findById(result.insertId);
}

async function findAll() {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC'
  );
  return rows;
}

async function updateRole(id, role) {
  await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  return findById(id);
}

module.exports = { findByEmail, findById, create, findAll, updateRole };
