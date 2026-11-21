/*
 * Concurrency test for Objective 4 / RQ3: "booking integrity is
 * guaranteed under concurrent access".
 *
 * This fires N simultaneous booking requests at a single slot that only
 * has capacity for 1, and checks that exactly 1 succeeds and the rest
 * are rejected with "slot fully booked" — proving the row-locking
 * transaction in bookingModel.createBooking() prevents overselling.
 *
 * Requires the API server to be running (npm start) against a database
 * that has been created from schema.sql. Run with:
 *   npm run test:concurrency
 */
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:8081/api';
const CONCURRENT_CUSTOMERS = 8; // how many customers race for the 1-seat slot
const RUN_ID = Date.now(); // keeps re-runs from colliding on unique emails

const api = axios.create({ baseURL: BASE_URL, validateStatus: () => true });

async function registerOrLogin(email, password, extra = {}) {
  const reg = await api.post('/auth/register', { email, password, name: email.split('@')[0], ...extra });
  if (reg.status === 201) return reg.data.token;
  const login = await api.post('/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`Could not auth as ${email}: ${JSON.stringify(login.data)}`);
  return login.data.token;
}

async function main() {
  console.log(`\n=== Concurrency test (run ${RUN_ID}) ===`);
  console.log(`Racing ${CONCURRENT_CUSTOMERS} simultaneous customers for a slot with capacity 1...\n`);

  // 1. Operator account + a garage with capacity for exactly one bay,
  //    with opening hours narrowed so slot generation produces exactly
  //    one slot for the test date.
  const operatorToken = await registerOrLogin(`concurrency-op-${RUN_ID}@test.local`, 'password123', { role: 'operator' });

  const garageRes = await api.post('/garages',
    {
      name: `Concurrency Test Garage ${RUN_ID}`,
      address: '1 Test Lane', city: 'Colombo',
      bayCapacity: 1, openingTime: '09:00:00', closingTime: '10:00:00', slotDurationMinutes: 60
    },
    { headers: { Authorization: `Bearer ${operatorToken}` } }
  );
  if (garageRes.status !== 201) throw new Error(`Garage creation failed: ${JSON.stringify(garageRes.data)}`);
  const garageId = garageRes.data.garage.id;

  const serviceRes = await api.post(`/garages/${garageId}/services`,
    { name: 'Test Service', price: 1000, durationMinutes: 60 },
    { headers: { Authorization: `Bearer ${operatorToken}` } }
  );
  const serviceId = serviceRes.data.service.id;

  const testDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // tomorrow
  await api.post(`/garages/${garageId}/slots/generate`,
    { fromDate: testDate, toDate: testDate },
    { headers: { Authorization: `Bearer ${operatorToken}` } }
  );

  const slotsRes = await api.get(`/garages/${garageId}/slots`, { params: { date: testDate } });
  if (slotsRes.data.slots.length !== 1) {
    throw new Error(`Expected exactly 1 slot to be generated, got ${slotsRes.data.slots.length}`);
  }
  const slot = slotsRes.data.slots[0];
  console.log(`Slot ${slot.id} created: ${slot.slot_date} ${slot.start_time}-${slot.end_time}, capacity=${slot.capacity}\n`);

  // 2. N customer accounts, each with their own token.
  const customerTokens = await Promise.all(
    Array.from({ length: CONCURRENT_CUSTOMERS }, (_, i) =>
      registerOrLogin(`concurrency-cust-${RUN_ID}-${i}@test.local`, 'password123', { role: 'owner' }))
  );

  // 3. Fire all booking requests at the same instant.
  const results = await Promise.all(
    customerTokens.map((token) =>
      api.post('/bookings', { slotId: slot.id, serviceId },
        { headers: { Authorization: `Bearer ${token}` } })
    )
  );

  const successes = results.filter((r) => r.status === 201);
  const conflicts = results.filter((r) => r.status === 409);
  const unexpected = results.filter((r) => r.status !== 201 && r.status !== 409);

  console.log(`Results: ${successes.length} succeeded, ${conflicts.length} rejected as fully-booked, ${unexpected.length} unexpected.\n`);

  unexpected.forEach((r, i) => console.log(`  Unexpected response #${i}: status=${r.status} body=${JSON.stringify(r.data)}`));

  // 4. Verify against the database's own view of the slot, not just the
  //    HTTP response codes.
  const finalSlotsRes = await api.get(`/garages/${garageId}/slots`, { params: { date: testDate } });
  const finalSlot = finalSlotsRes.data.slots.find((s) => s.id === slot.id);
  console.log(`Final slot state: booked_count=${finalSlot.booked_count} / capacity=${finalSlot.capacity}\n`);

  const pass =
    successes.length === 1 &&
    conflicts.length === CONCURRENT_CUSTOMERS - 1 &&
    unexpected.length === 0 &&
    finalSlot.booked_count === finalSlot.capacity;

  if (pass) {
    console.log('PASS — exactly one booking succeeded; the slot was never oversold.\n');
    process.exit(0);
  } else {
    console.log('FAIL — the slot was oversold or an unexpected error occurred. See details above.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Concurrency test crashed:', err.message);
  process.exit(1);
});
