const pool = require('../config/db');

async function findByGarage(garageId, { includeInactive = false } = {}) {
  const sql = includeInactive
    ? 'SELECT * FROM services WHERE garage_id = ? ORDER BY name'
    : 'SELECT * FROM services WHERE garage_id = ? AND is_active = TRUE ORDER BY name';
  const [rows] = await pool.query(sql, [garageId]);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM services WHERE id = ?', [id]);
  return rows[0] || null;
}

async function create({ garageId, name, description, price, priceType, vehicleTypes, durationMinutes }) {
  const [result] = await pool.query(
    `INSERT INTO services (garage_id, name, description, price, price_type, vehicle_types, duration_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [garageId, name, description || null, price, priceType || 'fixed',
      vehicleTypes || 'car,suv,van,motorcycle,three_wheeler,lorry', durationMinutes || 60]
  );
  return findById(result.insertId);
}

async function update(id, fields) {
  const allowed = ['name', 'description', 'price', 'price_type', 'vehicle_types', 'duration_minutes', 'is_active'];
  const sets = [];
  const params = [];
  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`);
      params.push(value);
    }
  }
  if (sets.length === 0) return findById(id);
  params.push(id);
  await pool.query(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

async function remove(id) {
  await pool.query('DELETE FROM services WHERE id = ?', [id]);
}

module.exports = { findByGarage, findById, create, update, remove };
