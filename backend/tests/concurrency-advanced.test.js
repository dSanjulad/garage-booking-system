// Concurrency tests (Objective 4 / RQ3). Each scenario fires requests at
// the same instant and then checks the database's own invariant:
//     booked_count == number of confirmed bookings  AND  <= capacity
// Needs the API running (npm start).
const test = require('node:test');
const assert = require('node:assert/strict');
const { api, db, auth, register, setupGarage, slotState } = require('./helpers');

test.after(async () => { await db.end(); });

const count = (results, status) => results.filter((r) => r.status === status).length;

test('CT-01 capacity 5, 50 simultaneous customers: exactly 5 succeed', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 5 });
  const customers = await Promise.all(Array.from({ length: 50 }, () => register('owner')));

  const results = await Promise.all(customers.map((c) =>
    api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(c.token))));

  assert.equal(count(results, 201), 5);
  assert.equal(count(results, 409), 45);
  assert.equal(results.length, count(results, 201) + count(results, 409), 'no 5xx or other statuses');
  const s = await slotState(slots[0].id);
  assert.deepEqual([s.booked_count, s.confirmed, s.capacity], [5, 5, 5]);
});

test('CT-02 one customer double-clicking 10 times books once', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 5 });
  const owner = await register('owner');

  const results = await Promise.all(Array.from({ length: 10 }, () =>
    api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))));

  assert.equal(count(results, 201), 1);
  assert.equal(count(results, 409), 9);
  const s = await slotState(slots[0].id);
  assert.deepEqual([s.booked_count, s.confirmed], [1, 1]);
});

test('CT-03 two customers swapping into each other\'s full slots: no deadlock, no corruption', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 1 });
  const a = await register('owner');
  const b = await register('owner');
  const bookA = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(a.token))).data.booking;
  const bookB = (await api.post('/bookings', { slotId: slots[1].id, serviceId }, auth(b.token))).data.booking;

  const results = await Promise.all([
    api.patch(`/bookings/${bookA.id}/reschedule`, { slotId: slots[1].id }, auth(a.token)),
    api.patch(`/bookings/${bookB.id}/reschedule`, { slotId: slots[0].id }, auth(b.token))
  ]);

  results.forEach((r) => assert.equal(r.status, 409, `expected clean rejection, got ${r.status} ${JSON.stringify(r.data)}`));
  for (const slot of [slots[0], slots[1]]) {
    const s = await slotState(slot.id);
    assert.deepEqual([s.booked_count, s.confirmed], [1, 1]);
  }
});

test('CT-04 reschedule racing a new booking for the same last seat: exactly one wins', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 1 });
  const mover = await register('owner');
  const rival = await register('owner');
  const booking = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(mover.token))).data.booking;

  const results = await Promise.all([
    api.patch(`/bookings/${booking.id}/reschedule`, { slotId: slots[1].id }, auth(mover.token)),
    api.post('/bookings', { slotId: slots[1].id, serviceId }, auth(rival.token))
  ]);

  assert.equal(count(results, 409) + count(results, 200) + count(results, 201), 2, 'no 5xx');
  assert.equal(count(results, 409), 1, 'exactly one request must lose');
  const s1 = await slotState(slots[1].id);
  assert.deepEqual([s1.booked_count, s1.confirmed, s1.capacity], [1, 1, 1]);
});

test('CT-05 cancellations racing new bookings never break the counter invariant', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 3 });
  const holders = await Promise.all(Array.from({ length: 3 }, () => register('owner')));
  const held = await Promise.all(holders.map(async (h) =>
    (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(h.token))).data.booking));
  const newcomers = await Promise.all(Array.from({ length: 10 }, () => register('owner')));

  const results = await Promise.all([
    ...held.map((bk, i) => api.patch(`/bookings/${bk.id}/cancel`, {}, auth(holders[i].token))),
    ...newcomers.map((c) => api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(c.token)))
  ]);

  results.forEach((r) => assert.ok([200, 201, 409].includes(r.status), `unexpected ${r.status} ${JSON.stringify(r.data)}`));
  const s = await slotState(slots[0].id);
  assert.equal(s.booked_count, s.confirmed, 'stored counter must equal real confirmed bookings');
  assert.ok(s.booked_count <= s.capacity, 'never oversold');
});

test('CT-06 long services: a 2-slot job and a 1-slot job racing for the shared bay cannot both win', async () => {
  // Capacity 1. The 120-minute service needs slots 0 and 1; the other customer
  // wants only slot 1. If bookings only claimed their first slot, both would pass.
  const { operator, garageId, serviceId: shortId, slots } = await setupGarage({ bayCapacity: 1, serviceMinutes: 30 });
  const long = await api.post(`/garages/${garageId}/services`, { name: 'Long job', price: 5000, durationMinutes: 120 }, auth(operator.token));
  const a = await register('owner');
  const b = await register('owner');

  const results = await Promise.all([
    api.post('/bookings', { slotId: slots[0].id, serviceId: long.data.service.id }, auth(a.token)),
    api.post('/bookings', { slotId: slots[1].id, serviceId: shortId }, auth(b.token))
  ]);

  assert.equal(count(results, 201), 1, 'exactly one must win');
  assert.equal(count(results, 409), 1);
  for (const slot of [slots[0], slots[1]]) {
    const s = await slotState(slot.id);
    assert.equal(s.booked_count, s.confirmed);
    assert.ok(s.booked_count <= s.capacity);
  }
});

test('CT-07 overlapping long services in opposite order: no deadlock, invariant holds', async () => {
  const { operator, garageId, slots } = await setupGarage({ bayCapacity: 2, closingTime: '15:00:00' });
  const long = (await api.post(`/garages/${garageId}/services`, { name: 'Long job', price: 5000, durationMinutes: 180 }, auth(operator.token))).data.service;
  const customers = await Promise.all(Array.from({ length: 12 }, () => register('owner')));

  const results = await Promise.all(customers.map((c, i) =>
    api.post('/bookings', { slotId: slots[i % 4].id, serviceId: long.id }, auth(c.token))));

  results.forEach((r) => assert.ok([201, 409].includes(r.status), `unexpected ${r.status} ${JSON.stringify(r.data)}`));
  for (const slot of slots) {
    const s = await slotState(slot.id);
    assert.equal(s.booked_count, s.confirmed, 'counter must match reality');
    assert.ok(s.booked_count <= s.capacity, 'never oversold');
  }
});

test('CT-08 double-clicking Pay creates one payment, not two', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const booking = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking;

  const results = await Promise.all(Array.from({ length: 8 }, () =>
    api.post(`/bookings/${booking.id}/payments`, { paymentType: 'full' }, auth(owner.token))));
  results.forEach((r) => assert.equal(r.status, 201));
  assert.equal(new Set(results.map((r) => r.data.payment.id)).size, 1);
});
