const pool = require('../config/db');

// Every figure is a correlated subquery rather than a JOIN + GROUP BY, because
// the price has to depend on the search. Someone comparing "brake pads" for a
// motorcycle needs the price of that service, not the garage's cheapest job.
function garageSelect({ serviceQuery, vehicleType, nowDateTime } = {}) {
  const priceFilters = ['s.garage_id = g.id', 's.is_active = TRUE'];
  const params = [];
  if (serviceQuery) {
    priceFilters.push('s.name LIKE ?');
    params.push(`%${serviceQuery}%`);
  }
  if (vehicleType) {
    priceFilters.push('FIND_IN_SET(?, s.vehicle_types)');
    params.push(vehicleType);
  }
  params.push(nowDateTime || localNow());

  const sql = `
    SELECT
      g.id, g.operator_id, g.name, g.description, g.address, g.city, g.phone,
      g.latitude, g.longitude, g.bay_capacity, g.opening_time, g.closing_time,
      g.slot_duration_minutes, g.closed_weekdays, g.is_active, g.is_verified, g.created_at,
      u.name AS operator_name,
      (SELECT ROUND(COALESCE(AVG(r.rating), 0), 2) FROM reviews r WHERE r.garage_id = g.id AND r.is_hidden = FALSE) AS avg_rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.garage_id = g.id AND r.is_hidden = FALSE) AS review_count,
      (SELECT MIN(s.price) FROM services s WHERE ${priceFilters.join(' AND ')}) AS min_price,
      (SELECT MIN(TIMESTAMP(sl.slot_date, sl.start_time)) FROM slots sl
        WHERE sl.garage_id = g.id AND sl.booked_count < sl.capacity
          AND TIMESTAMP(sl.slot_date, sl.start_time) > ?) AS next_free_at
    FROM garages g
    JOIN users u ON u.id = g.operator_id
  `;
  return { sql, params };
}

function localNow(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

// Search and compare: any mix of city, garage or service text, vehicle type,
// price ceiling and minimum rating. All optional, so this also browses.
async function search({ city, q, vehicleType, maxPrice, minRating, sortBy = 'rating', includeInactive = false } = {}) {
  const select = garageSelect({ vehicleType, serviceQuery: q && (await matchesAnyService(q)) ? q : undefined });
  const where = includeInactive ? ['1 = 1'] : ['g.is_active = TRUE'];
  const params = [...select.params];

  if (city) {
    where.push('g.city LIKE ?');
    params.push(`%${city}%`);
  }
  if (q) {
    where.push('(g.name LIKE ? OR EXISTS (SELECT 1 FROM services s2 WHERE s2.garage_id = g.id AND s2.is_active = TRUE AND s2.name LIKE ?))');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (vehicleType) {
    where.push('EXISTS (SELECT 1 FROM services s3 WHERE s3.garage_id = g.id AND s3.is_active = TRUE AND FIND_IN_SET(?, s3.vehicle_types))');
    params.push(vehicleType);
  }

  const having = [];
  if (maxPrice) {
    having.push('(min_price IS NULL OR min_price <= ?)');
    params.push(maxPrice);
  }
  if (minRating) {
    having.push('avg_rating >= ?');
    params.push(minRating);
  }

  const order = {
    rating: 'avg_rating DESC, review_count DESC, g.name ASC',
    price: 'min_price IS NULL, min_price ASC',
    soonest: 'next_free_at IS NULL, next_free_at ASC',
    name: 'g.name ASC'
  }[sortBy] || 'avg_rating DESC, review_count DESC, g.name ASC';

  const [rows] = await pool.query(
    `${select.sql}
     WHERE ${where.join(' AND ')}
     ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
     ORDER BY ${order}`,
    params
  );
  return rows;
}

// A search for a garage's name shouldn't narrow prices to services with that
// word in them, so only filter prices when the text actually names a service.
async function matchesAnyService(q) {
  const [rows] = await pool.query('SELECT 1 FROM services WHERE is_active = TRUE AND name LIKE ? LIMIT 1', [`%${q}%`]);
  return rows.length > 0;
}

async function findById(id) {
  const select = garageSelect();
  const [rows] = await pool.query(`${select.sql} WHERE g.id = ?`, [...select.params, id]);
  return rows[0] || null;
}

async function findByOperator(operatorId) {
  const select = garageSelect();
  const [rows] = await pool.query(
    `${select.sql} WHERE g.operator_id = ? ORDER BY g.created_at DESC, g.id DESC`,
    [...select.params, operatorId]
  );
  return rows;
}

async function create({ operatorId, name, description, address, city, phone, latitude, longitude, bayCapacity, openingTime, closingTime, slotDurationMinutes, closedWeekdays }) {
  const [result] = await pool.query(
    `INSERT INTO garages
      (operator_id, name, description, address, city, phone, latitude, longitude, bay_capacity, opening_time, closing_time, slot_duration_minutes, closed_weekdays)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [operatorId, name, description || null, address, city, phone || null, latitude || null, longitude || null,
      bayCapacity || 1, openingTime || '08:00:00', closingTime || '18:00:00', slotDurationMinutes || 60, closedWeekdays || '']
  );
  return findById(result.insertId);
}

async function update(id, fields) {
  const allowed = ['name', 'description', 'address', 'city', 'phone', 'latitude', 'longitude',
    'bay_capacity', 'opening_time', 'closing_time', 'slot_duration_minutes', 'closed_weekdays', 'is_active', 'is_verified'];
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
  await pool.query(`UPDATE garages SET ${sets.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

async function remove(id) {
  await pool.query('DELETE FROM garages WHERE id = ?', [id]);
}

module.exports = { search, findById, findByOperator, create, update, remove, localNow };
