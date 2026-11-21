// Functional tests for the booking rules, authorization and validation.
// Needs the API running (npm start) against the seeded database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { api, db, auth, register, setupGarage, slotState, moveSlotToPast, isoLocal } = require('./helpers');

test.after(async () => { await db.end(); });

test('FT-01 owner can book, reschedule and cancel; slot counters follow', async () => {
  const { garageId, serviceId, slots, date } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');

  let r = await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token));
  assert.equal(r.status, 201);
  const id = r.data.booking.id;
  assert.equal((await slotState(slots[0].id)).booked_count, 1);

  r = await api.patch(`/bookings/${id}/reschedule`, { slotId: slots[1].id }, auth(owner.token));
  assert.equal(r.status, 200);
  assert.equal((await slotState(slots[0].id)).booked_count, 0);
  assert.equal((await slotState(slots[1].id)).booked_count, 1);

  r = await api.patch(`/bookings/${id}/cancel`, {}, auth(owner.token));
  assert.equal(r.status, 200);
  assert.equal((await slotState(slots[1].id)).booked_count, 0);

  r = await api.patch(`/bookings/${id}/cancel`, {}, auth(owner.token));
  assert.equal(r.status, 409, 'cancelling twice must be rejected');
});

test('FT-02 generated slots carry exactly the requested date (timezone regression)', async () => {
  const { slots, date } = await setupGarage();
  assert.ok(slots.length > 0);
  assert.ok(slots.every((s) => s.slot_date === date));
});

test('FT-03 past dates are rejected for slot generation, booking and rescheduling', async () => {
  const { operator, garageId, serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');

  let r = await api.post(`/garages/${garageId}/slots/generate`, { fromDate: isoLocal(-5), toDate: isoLocal(-5) }, auth(operator.token));
  assert.equal(r.status, 400);

  const [ins] = await db.query('INSERT INTO slots (garage_id, slot_date, start_time, end_time, capacity) VALUES (?, ?, ?, ?, 2)',
    [garageId, isoLocal(-40), '09:00:00', '10:00:00']);
  r = await api.post('/bookings', { slotId: ins.insertId, serviceId }, auth(owner.token));
  assert.equal(r.status, 400);

  r = await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token));
  const id = r.data.booking.id;
  r = await api.patch(`/bookings/${id}/reschedule`, { slotId: ins.insertId }, auth(owner.token));
  assert.equal(r.status, 400);
});

test('FT-04 a customer cannot hold two bookings in the same slot', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 3 });
  const owner = await register('owner');
  let r = await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token));
  assert.equal(r.status, 201);
  r = await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token));
  assert.equal(r.status, 409);
  assert.equal((await slotState(slots[0].id)).booked_count, 1);
});

test('FT-05 a service from another garage cannot be booked', async () => {
  const a = await setupGarage();
  const b = await setupGarage();
  const owner = await register('owner');
  const r = await api.post('/bookings', { slotId: a.slots[0].id, serviceId: b.serviceId }, auth(owner.token));
  assert.equal(r.status, 400);
});

test('FT-06 verified reviews: only after the operator completes a booking whose time has started', async () => {
  const { operator, serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;

  let r = await api.post(`/bookings/${id}/review`, { rating: 5 }, auth(owner.token));
  assert.equal(r.status, 409, 'no review before completion');

  r = await api.patch(`/bookings/${id}/status`, { status: 'completed' }, auth(operator.token));
  assert.equal(r.status, 409, 'cannot complete a future booking');

  await moveSlotToPast(slots[0].id); // time passes
  r = await api.patch(`/bookings/${id}/status`, { status: 'completed' }, auth(operator.token));
  assert.equal(r.status, 200);

  r = await api.post(`/bookings/${id}/review`, { rating: 'abc' }, auth(owner.token));
  assert.equal(r.status, 400);
  r = await api.post(`/bookings/${id}/review`, { rating: 4.5 }, auth(owner.token));
  assert.equal(r.status, 400);

  const stranger = await register('owner');
  r = await api.post(`/bookings/${id}/review`, { rating: 5 }, auth(stranger.token));
  assert.equal(r.status, 403, "another customer cannot review someone else's booking");

  r = await api.post(`/bookings/${id}/review`, { rating: 5, comment: 'Good job' }, auth(owner.token));
  assert.equal(r.status, 201);
  r = await api.post(`/bookings/${id}/review`, { rating: 5 }, auth(owner.token));
  assert.equal(r.status, 409, 'only one review per booking');

  const mine = (await api.get('/bookings/my', auth(owner.token))).data.bookings.find((b) => b.id === id);
  assert.equal(mine.has_review, 1);
});

test('FT-07 authorization: roles and ownership are enforced', async () => {
  const a = await setupGarage();
  const b = await setupGarage();
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: a.slots[0].id, serviceId: a.serviceId }, auth(owner.token))).data.booking.id;

  assert.equal((await api.post('/bookings', { slotId: a.slots[1].id, serviceId: a.serviceId })).status, 401, 'anonymous');
  assert.equal((await api.post('/bookings', { slotId: a.slots[1].id, serviceId: a.serviceId }, auth(a.operator.token))).status, 403, 'operators cannot book');
  assert.equal((await api.get(`/bookings/garage/${a.garageId}`, auth(b.operator.token))).status, 403, "other operator cannot list this garage's bookings");
  assert.equal((await api.patch(`/bookings/${id}/status`, { status: 'completed' }, auth(b.operator.token))).status, 403);
  assert.equal((await api.post(`/garages/${a.garageId}/services`, { name: 'x', price: 1 }, auth(b.operator.token))).status, 403);
  assert.equal((await api.get('/users', auth(owner.token))).status, 403, 'only admins list users');
  const stranger = await register('owner');
  assert.equal((await api.patch(`/bookings/${id}/cancel`, {}, auth(stranger.token))).status, 403, "cannot cancel someone else's booking");
});

test('FT-08 input validation returns 400 with a message, never 500', async () => {
  const { operator, garageId } = await setupGarage();
  const bad = [
    ['register bad email', () => api.post('/auth/register', { name: 'a', email: 'nope', password: '123456' })],
    ['register short password', () => api.post('/auth/register', { name: 'a', email: 'a@b.lk', password: '123' })],
    ['garage negative capacity', () => api.post('/garages', { name: 'g', address: 'a', city: 'c', bayCapacity: -2 }, auth(operator.token))],
    ['garage closes before opens', () => api.post('/garages', { name: 'g', address: 'a', city: 'c', openingTime: '18:00', closingTime: '08:00' }, auth(operator.token))],
    ['service negative price', () => api.post(`/garages/${garageId}/services`, { name: 'x', price: -5 }, auth(operator.token))],
    ['service text price', () => api.post(`/garages/${garageId}/services`, { name: 'x', price: 'abc' }, auth(operator.token))],
    ['slots malformed date', () => api.post(`/garages/${garageId}/slots/generate`, { fromDate: isoLocal(2), toDate: 'bad' }, auth(operator.token))],
    ['slots missing date param', () => api.get(`/garages/${garageId}/slots`)]
  ];
  for (const [name, call] of bad) {
    const r = await call();
    assert.equal(r.status, 400, `${name} -> ${r.status} ${JSON.stringify(r.data)}`);
    assert.ok(r.data.message);
  }
});

test('FT-09 admin sees hidden garages; the public does not', async () => {
  const { operator, garageId } = await setupGarage();
  const adminLogin = await api.post('/auth/login', { email: 'admin@garagebooking.lk', password: 'admin123' });
  assert.equal(adminLogin.status, 200, 'seeded admin account is required (npm run seed)');
  const admin = adminLogin.data.token;

  await api.put(`/garages/${garageId}`, { isActive: false }, auth(operator.token));
  assert.ok(!(await api.get('/garages')).data.garages.some((g) => g.id === garageId));
  assert.ok((await api.get('/garages', auth(admin))).data.garages.some((g) => g.id === garageId));
});

test('FT-10 a slot with bookings cannot be deleted', async () => {
  const { operator, serviceId, slots } = await setupGarage();
  const owner = await register('owner');
  await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token));
  assert.equal((await api.delete(`/slots/${slots[0].id}`, auth(operator.token))).status, 409);
});
