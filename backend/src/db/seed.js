// Fills an empty database with demo data so every screen has something real to
// show. All garages, people and reviews here are fictional. Run: npm run seed
require('dotenv').config();
process.env.TZ = process.env.TZ || 'Asia/Colombo';
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const garageModel = require('../models/garageModel');
const serviceModel = require('../models/serviceModel');
const slotModel = require('../models/slotModel');
const bookingModel = require('../models/bookingModel');
const { todayLocalISO, slotsNeeded, slotLengthMinutes, annotateSlots } = require('../utils/timeSlots');

const ALL_MOTOR = ['car', 'suv', 'van'];

const GARAGES = [
  {
    operator: { name: 'Kasun Fernando', email: 'kasun@colomboautoworks.lk', phone: '0711234567' },
    name: 'Colombo Auto Works', city: 'Colombo 02', address: '45 Union Place', phone: '0112345678', verified: true,
    description: 'Full-service garage for Japanese and Indian vehicles. Same-day turnaround on routine maintenance.',
    latitude: 6.9188, longitude: 79.8571, bays: 3, open: '08:00:00', close: '17:00:00', slot: 60, closed: '0',
    services: [
      ['Oil & Filter Change', 'Mineral or full synthetic oil, including a new filter.', 6500, 'starting_from', 45, ALL_MOTOR],
      ['Brake Pad Replacement', 'Front pads, including a disc inspection.', 12000, 'starting_from', 90, ALL_MOTOR],
      ['Full Service', 'Oil, filters, fluids and brakes, with a written check-up report.', 18500, 'starting_from', 120, ALL_MOTOR],
      ['Engine Diagnostic Scan', 'OBD scan and written findings. Repair quoted after inspection.', 2500, 'inspection', 30, ALL_MOTOR]
    ]
  },
  {
    operator: { name: 'Ruwan Silva', email: 'ruwan@dehiwalamotors.lk', phone: '0712345678' },
    name: 'Dehiwala Motors', city: 'Dehiwala', address: '112 Galle Road', phone: '0112456789', verified: true,
    description: 'Family-run workshop since 1998. Known for brakes, suspension and insurance inspections.',
    latitude: 6.8402, longitude: 79.8656, bays: 2, open: '08:30:00', close: '18:00:00', slot: 45, closed: '0',
    services: [
      ['Wheel Alignment', 'Computerised 4-wheel alignment.', 4500, 'fixed', 45, ALL_MOTOR],
      ['Suspension Check & Repair', 'Shock absorbers, bushes and linkages.', 15000, 'starting_from', 120, ALL_MOTOR],
      ['Pre-Insurance Inspection', 'Full inspection report for insurance renewal.', 3000, 'fixed', 30, ALL_MOTOR],
      ['Oil & Filter Change', 'Includes a free fluid top-up.', 5900, 'starting_from', 45, ALL_MOTOR]
    ]
  },
  {
    operator: { name: 'Dilshan Jayawardena', email: 'dilshan@nugegodaservice.lk', phone: '0713456789' },
    name: 'Nugegoda Service Hub', city: 'Nugegoda', address: '78 High Level Road', phone: '0112567890', verified: true,
    description: 'Hybrid battery checks and servicing, with a separate bay for full hybrid diagnostics.',
    latitude: 6.8649, longitude: 79.8997, bays: 4, open: '07:30:00', close: '17:30:00', slot: 60, closed: '0',
    services: [
      ['Hybrid Battery Health Check', 'Cell-level test and printed report.', 7500, 'fixed', 60, ['car', 'suv']],
      ['Full Service', 'Full check-up including hybrid system scan.', 21000, 'starting_from', 180, ALL_MOTOR],
      ['AC Service & Regas', 'Leak test, cleaning and regas.', 9500, 'starting_from', 90, ALL_MOTOR],
      ['Oil & Filter Change', 'Low-viscosity oils for hybrids in stock.', 7200, 'starting_from', 45, ALL_MOTOR]
    ]
  },
  {
    operator: { name: 'Sampath Wijesinghe', email: 'sampath@kandyroadgarage.lk', phone: '0714567890' },
    name: 'Kandy Road Garage', city: 'Kadawatha', address: '256 Kandy Road', phone: '0112678901', verified: false,
    description: 'Vans, lorries and commercial vehicles welcome. Large yard and long-wheelbase bays.',
    latitude: 7.0014, longitude: 79.9530, bays: 2, open: '08:00:00', close: '18:00:00', slot: 60, closed: '0',
    services: [
      ['Commercial Vehicle Service', 'Oil, filters, greasing and brake adjustment.', 24000, 'starting_from', 180, ['van', 'lorry']],
      ['Brake Overhaul', 'Shoes or pads, drums or discs, all wheels.', 22000, 'starting_from', 180, ['van', 'lorry', 'suv']],
      ['Wheel Balancing', 'Per set of four wheels.', 3500, 'fixed', 60, ['car', 'suv', 'van', 'lorry']]
    ]
  },
  {
    operator: { name: 'Nimal Rathnayake', email: 'nimal@maharagamatwowheel.lk', phone: '0715678901' },
    name: 'Maharagama Moto Care', city: 'Maharagama', address: '19 Old Road', phone: '0112789012', verified: true,
    description: 'Motorcycles and three-wheelers only, with most routine jobs done within the hour.',
    latitude: 6.8480, longitude: 79.9265, bays: 3, open: '08:00:00', close: '18:30:00', slot: 30, closed: '0',
    services: [
      ['Three-Wheeler Full Service', 'Oil, plugs, cables and a brake check.', 4800, 'fixed', 60, ['three_wheeler']],
      ['Motorcycle Tune-Up', 'Chain, plug, carb or injector clean and oil.', 3200, 'fixed', 60, ['motorcycle']],
      ['Oil Change', 'Includes filter where fitted.', 1800, 'fixed', 30, ['motorcycle', 'three_wheeler']]
    ]
  },
  {
    operator: { name: 'Chamara Gunasekara', email: 'chamara@negombobay.lk', phone: '0716789012' },
    name: 'Negombo Bay Autocare', city: 'Negombo', address: '8 Lewis Place', phone: '0312345678', verified: false,
    description: 'Rust treatment and undercarriage protection for vehicles kept near the coast.',
    latitude: 7.2150, longitude: 79.8389, bays: 2, open: '08:30:00', close: '17:00:00', slot: 60, closed: '0,6',
    services: [
      ['Underbody Rust Protection', 'Wash, treatment and sealant coat.', 16500, 'starting_from', 180, ALL_MOTOR],
      ['Full Service', 'Oil, filters, fluids and a brake check.', 16000, 'starting_from', 120, ALL_MOTOR],
      ['Exterior Detail', 'Wash, clay and machine polish.', 8500, 'fixed', 120, ALL_MOTOR]
    ]
  }
];

const CUSTOMERS = [
  ['Nadeesha Perera', 'owner@example.com', '0771234567'],
  ['Ashan de Silva', 'ashan@example.com', '0772345678'],
  ['Tharushi Bandara', 'tharushi@example.com', '0773456789'],
  ['Mohamed Rizwan', 'rizwan@example.com', '0774567890'],
  ['Kavindu Herath', 'kavindu@example.com', '0775678901']
];

const REVIEWS = [
  [5, 'Started right on the booked time, and they showed me the worn pads before replacing them.'],
  [5, 'Price matched what was listed. In and out in under two hours.'],
  [4, 'Good work and clear explanation. The waiting area is small.'],
  [5, 'First time here and I was nervous about using an unknown garage. No reason to be.'],
  [4, 'They called before doing anything extra. Finished a little later than expected.'],
  [3, 'The work was fine, but I had to wait 30 minutes past my slot.'],
  [5, 'Very honest. They told me a part I expected to change still had life left in it.'],
  [4, 'Clean workshop, fair price, would book again.'],
  [2, 'They kept my slot, but the bill came to more than the listed starting price.'],
  [3, 'Decent job. The phone was not answered when I called to check progress.'],
  [5, 'Could follow the job on the tracker, so I only came when it was ready.'],
  [4, 'Explained the problem in plain language and did not push extras.']
];
// Not every garage is equally good, or there would be nothing to compare.
const REVIEW_MIX = [
  [0, 1, 3, 6, 10, 11],
  [2, 4, 7, 11, 0, 5],
  [0, 7, 6, 11, 10, 2],
  [5, 8, 9, 2, 4, 5],
  [1, 6, 10, 0, 3, 11],
  [8, 9, 5, 2, 4, 7]
];

async function upsertUser({ name, email, password = 'password123', phone, role }) {
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return existing[0].id;
  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
    [name, email, passwordHash, phone, role]
  );
  return result.insertId;
}

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return todayLocalISO(d);
}

// Writes a historical booking straight to the tables, because the API rightly
// refuses to create bookings in the past.
async function insertHistorical({ garage, service, customerId, date, status, stage }) {
  const slots = await slotModel.findByGarageAndDate(garage.id, date);
  if (!slots.length) return null;
  const needed = slotsNeeded(service.duration_minutes, slotLengthMinutes(slots[0]));
  const far = new Date('2000-01-01');
  const fitting = annotateSlots(slots, needed, far).filter((s) => s.fits);
  if (!fitting.length) return null;
  const start = fitting[Math.floor(fitting.length / 2)];
  const index = slots.findIndex((s) => s.id === start.id);
  const runIds = slots.slice(index, index + needed).map((s) => s.id);

  await pool.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id IN (?)', [runIds]);
  const [result] = await pool.query(
    `INSERT INTO bookings (garage_id, service_id, slot_id, customer_id, vehicle_type, status, job_stage, completed_by, created_at)
     VALUES (?, ?, ?, ?, 'car', ?, ?, ?, ?)`,
    [garage.id, service.id, start.id, customerId, status, stage, status === 'completed' ? 'operator' : null, `${date} 07:00:00`]
  );
  await pool.query('INSERT INTO booking_slots (booking_id, slot_id) VALUES ?', [runIds.map((id) => [result.insertId, id])]);
  await pool.query('INSERT INTO booking_events (booking_id, event, created_at) VALUES (?, ?, ?)', [result.insertId, 'booked', `${date} 07:00:00`]);
  return { id: result.insertId, start };
}

async function main() {
  const [[{ c }]] = await pool.query('SELECT COUNT(*) AS c FROM garages');
  if (c > 0) {
    console.log('Garages already exist, so nothing was added. Use "npm run db:fresh" to start again.');
    return;
  }
  console.log('Seeding database...');

  await upsertUser({ name: 'System Admin', email: 'admin@garagebooking.lk', password: 'admin123', phone: '0770000000', role: 'admin' });
  const customerIds = [];
  for (const [name, email, phone] of CUSTOMERS) {
    customerIds.push(await upsertUser({ name, email, phone, role: 'owner' }));
  }

  const garages = [];
  for (const g of GARAGES) {
    const operatorId = await upsertUser({ ...g.operator, role: 'operator' });
    const garage = await garageModel.create({
      operatorId, name: g.name, description: g.description, address: g.address, city: g.city, phone: g.phone,
      latitude: g.latitude, longitude: g.longitude, bayCapacity: g.bays, openingTime: g.open, closingTime: g.close,
      slotDurationMinutes: g.slot, closedWeekdays: g.closed
    });
    if (g.verified) await garageModel.update(garage.id, { is_verified: true });
    const services = [];
    for (const [name, description, price, priceType, durationMinutes, types] of g.services) {
      services.push(await serviceModel.create({ garageId: garage.id, name, description, price, priceType, durationMinutes, vehicleTypes: types.join(',') }));
    }
    await slotModel.generateForDateRange(garage, isoOffset(-30), isoOffset(21));
    garages.push({ ...garage, services });
  }

  // History: deterministic, so screenshots and marking see the same picture.
  let counter = 0;
  for (const [gIndex, garage] of garages.entries()) {
    for (let day = 29; day >= 1; day -= 1) {
      const perDay = (day + gIndex) % 3;
      for (let n = 0; n < perDay; n += 1) {
        counter += 1;
        const service = garage.services[counter % garage.services.length];
        const customerId = customerIds[counter % customerIds.length];
        const roll = counter % 11;
        const status = roll === 0 ? 'no_show' : roll === 1 ? 'cancelled' : 'completed';
        const booking = await insertHistorical({
          garage, service, customerId, date: isoOffset(-day), status, stage: status === 'completed' ? 'finished' : 'scheduled'
        });
        if (!booking) continue;
        if (status === 'cancelled') {
          // A cancelled booking holds no bays.
          await pool.query('UPDATE slots s JOIN booking_slots bs ON bs.slot_id = s.id SET s.booked_count = s.booked_count - 1 WHERE bs.booking_id = ?', [booking.id]);
        }
        // Reviews are mandatory before a customer can book again, so every completed
        // booking in the history has one.
        if (status === 'completed') {
          const mix = REVIEW_MIX[gIndex];
          const [rating, comment] = REVIEWS[mix[counter % mix.length]];
          await pool.query(
            'INSERT INTO reviews (booking_id, garage_id, customer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [booking.id, garage.id, customerId, rating, comment, `${isoOffset(-day)} 19:00:00`]
          );
        }
      }
    }
  }

  // The present: a job in the workshop today and upcoming appointments, so the
  // tracker and reminders have something to act on.
  const [cmb] = garages;
  const demoCustomer = customerIds[0];
  const today = todayLocalISO();
  const inWorkshop = await insertHistorical({ garage: cmb, service: cmb.services[1], customerId: demoCustomer, date: today, status: 'confirmed', stage: 'in_service' });
  if (inWorkshop) {
    await pool.query(
      "INSERT INTO booking_events (booking_id, event, note) VALUES (?, 'received', NULL), (?, 'in_service', 'Fitting new front pads')",
      [inWorkshop.id, inWorkshop.id]
    );
  }
  for (const [offset, customer, garage, serviceIndex] of [
    [2, demoCustomer, garages[2], 0],
    [1, customerIds[1], cmb, 0], [1, customerIds[2], cmb, 2], [2, customerIds[3], cmb, 1],
    [3, customerIds[4], garages[1], 0]
  ]) {
    const date = isoOffset(offset);
    const slots = await slotModel.findByGarageAndDate(garage.id, date);
    const service = garage.services[serviceIndex];
    const needed = slots.length ? slotsNeeded(service.duration_minutes, slotLengthMinutes(slots[0])) : 1;
    const start = annotateSlots(slots, needed).find((s) => s.fits);
    if (start) {
      await bookingModel.createBooking({ slotId: start.id, serviceId: service.id, customerId: customer, vehicleType: 'car', vehicleDetails: 'Toyota Aqua 2016' });
    }
  }

  // One customer is deliberately blocked: yesterday's job was completed and they
  // haven't reviewed it yet, which shows the mandatory-review rule at work.
  const pendingCustomer = await upsertUser({ name: 'Ruwan Fernando', email: 'review.pending@example.com', phone: '0776789012', role: 'owner' });
  await insertHistorical({ garage: cmb, service: cmb.services[0], customerId: pendingCustomer, date: isoOffset(-1), status: 'completed', stage: 'finished' });

  console.log('Seed complete. Demo accounts:');
  console.log('  Admin:    admin@garagebooking.lk / admin123');
  console.log('  Owner:    owner@example.com / password123');
  console.log('  Operator: kasun@colomboautoworks.lk / password123 (Colombo Auto Works)');
  console.log('  Owner who must review first: review.pending@example.com / password123');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
