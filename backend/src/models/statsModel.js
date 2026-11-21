const pool = require('../config/db');
const { todayLocalISO, dateRange } = require('../utils/timeSlots');
const { localNow } = require('./garageModel');

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// The figures a paper diary can't give a garage (report section 1.7).
async function forGarage(garageId) {
  const today = todayLocalISO();

  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(b.status = 'confirmed'), 0) AS upcoming,
            COALESCE(SUM(b.status = 'completed'), 0) AS completed,
            COALESCE(SUM(b.status = 'cancelled'), 0) AS cancelled,
            COALESCE(SUM(b.status = 'no_show'), 0) AS no_shows,
            COALESCE(SUM(IF(b.status = 'completed', s.price, 0)), 0) AS completed_value
     FROM bookings b JOIN services s ON s.id = b.service_id
     WHERE b.garage_id = ?`,
    [garageId]
  );

  const [[todayRow]] = await pool.query(
    `SELECT COUNT(*) AS bookings_today
     FROM bookings b JOIN slots sl ON sl.id = b.slot_id
     WHERE b.garage_id = ? AND sl.slot_date = ? AND b.status IN ('confirmed','completed')`,
    [garageId, today]
  );

  const [[occupancy]] = await pool.query(
    `SELECT COALESCE(SUM(booked_count), 0) AS booked, COALESCE(SUM(capacity), 0) AS capacity
     FROM slots WHERE garage_id = ? AND slot_date BETWEEN ? AND ?`,
    [garageId, today, addDays(today, 6)]
  );

  const [[rating]] = await pool.query(
    'SELECT ROUND(COALESCE(AVG(rating), 0), 2) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE garage_id = ? AND is_hidden = FALSE',
    [garageId]
  );

  const from = addDays(today, -13);
  const [daily] = await pool.query(
    `SELECT sl.slot_date AS day, COUNT(*) AS bookings
     FROM bookings b JOIN slots sl ON sl.id = b.slot_id
     WHERE b.garage_id = ? AND b.status <> 'cancelled' AND sl.slot_date BETWEEN ? AND ?
     GROUP BY sl.slot_date`,
    [garageId, from, today]
  );
  const byDay = new Map(daily.map((d) => [d.day, Number(d.bookings)]));

  const [topServices] = await pool.query(
    `SELECT s.name, COUNT(*) AS bookings
     FROM bookings b JOIN services s ON s.id = b.service_id
     WHERE b.garage_id = ? AND b.status <> 'cancelled'
     GROUP BY s.id ORDER BY bookings DESC, s.name LIMIT 5`,
    [garageId]
  );

  // No-show rate is measured against appointments that have actually happened.
  const attended = Number(totals.completed) + Number(totals.no_shows);
  return {
    ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Number(v)])),
    bookings_today: Number(todayRow.bookings_today),
    no_show_rate: attended ? Math.round((Number(totals.no_shows) / attended) * 1000) / 10 : null,
    occupancy_7d: Number(occupancy.capacity) ? Math.round((Number(occupancy.booked) / Number(occupancy.capacity)) * 100) : null,
    avg_rating: Number(rating.avg_rating),
    review_count: Number(rating.review_count),
    daily: dateRange(from, today).map((day) => ({ day, bookings: byDay.get(day) || 0 })),
    top_services: topServices.map((s) => ({ name: s.name, bookings: Number(s.bookings) }))
  };
}

async function forPlatform() {
  const [[row]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM users WHERE role = 'owner') AS owners,
       (SELECT COUNT(*) FROM users WHERE role = 'operator') AS operators,
       (SELECT COUNT(*) FROM garages) AS garages,
       (SELECT COUNT(*) FROM garages WHERE is_verified = TRUE) AS verified_garages,
       (SELECT COUNT(*) FROM bookings) AS bookings,
       (SELECT COUNT(*) FROM bookings WHERE status = 'completed') AS completed,
       (SELECT COUNT(*) FROM bookings WHERE status = 'no_show') AS no_shows,
       (SELECT COUNT(*) FROM reviews) AS reviews,
       (SELECT COUNT(*) FROM reviews WHERE is_hidden = TRUE) AS hidden_reviews,
       (SELECT COUNT(*) FROM notifications) AS notifications`
  );
  const stats = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
  const attended = stats.completed + stats.no_shows;
  stats.no_show_rate = attended ? Math.round((stats.no_shows / attended) * 1000) / 10 : null;
  return stats;
}

// The real, live numbers on the public home page, and the next open slots.
async function forHome() {
  const now = localNow();
  const [[row]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM garages WHERE is_active = TRUE) AS garages,
       (SELECT COUNT(*) FROM reviews WHERE is_hidden = FALSE) AS verified_reviews`
  );
  const [nextSlots] = await pool.query(
    `SELECT g.id AS garage_id, g.name AS garage_name, g.city,
            MIN(TIMESTAMP(sl.slot_date, sl.start_time)) AS next_free_at,
            (SELECT MIN(sv.price) FROM services sv WHERE sv.garage_id = g.id AND sv.is_active = TRUE) AS min_price
     FROM garages g
     JOIN slots sl ON sl.garage_id = g.id
     WHERE g.is_active = TRUE AND sl.booked_count < sl.capacity
       AND TIMESTAMP(sl.slot_date, sl.start_time) > ?
     GROUP BY g.id
     ORDER BY next_free_at, g.name
     LIMIT 6`,
    [now]
  );
  return { garages: Number(row.garages), verified_reviews: Number(row.verified_reviews), next_slots: nextSlots };
}

module.exports = { forGarage, forPlatform, forHome };
