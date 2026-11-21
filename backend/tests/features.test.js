// Functional tests for features added in the final phase. Needs the API running.
const test = require('node:test');
const assert = require('node:assert/strict');
const { api, db, auth, register, setupGarage, slotState, moveSlotToPast, isoLocal } = require('./helpers');

test.after(async () => { await db.end(); });

const adminToken = async () => (await api.post('/auth/login', { email: 'admin@garagebooking.lk', password: 'admin123' })).data.token;

async function completedBooking() {
  const g = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const booking = (await api.post('/bookings', { slotId: g.slots[0].id, serviceId: g.serviceId }, auth(owner.token))).data.booking;
  await moveSlotToPast(g.slots[0].id);
  await api.patch(`/bookings/${booking.id}/status`, { status: 'completed' }, auth(g.operator.token));
  return { ...g, owner, booking };
}

test('FT-11 a long service occupies every slot it needs, and cancelling frees them all', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 1, serviceMinutes: 120 });
  const owner = await register('owner');
  const r = await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token));
  assert.equal(r.status, 201);
  assert.equal(r.data.booking.end_time, '11:00:00');
  assert.equal((await slotState(slots[0].id)).booked_count, 1);
  assert.equal((await slotState(slots[1].id)).booked_count, 1);
  assert.equal((await slotState(slots[2].id)).booked_count, 0);

  await api.patch(`/bookings/${r.data.booking.id}/cancel`, {}, auth(owner.token));
  assert.equal((await slotState(slots[0].id)).booked_count, 0);
  assert.equal((await slotState(slots[1].id)).booked_count, 0);
});

test('FT-12 a long service that would run past closing time is refused', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 1, serviceMinutes: 120 });
  const owner = await register('owner');
  const r = await api.post('/bookings', { slotId: slots[2].id, serviceId }, auth(owner.token));
  assert.equal(r.status, 409);
  assert.equal((await slotState(slots[2].id)).booked_count, 0);
});

test('FT-13 slots report whether a chosen service fits', async () => {
  const { garageId, serviceId, slots, date } = await setupGarage({ bayCapacity: 1, serviceMinutes: 120 });
  const res = await api.get(`/garages/${garageId}/slots`, { params: { date, serviceId } });
  assert.equal(res.data.slots_needed, 2);
  assert.deepEqual(res.data.slots.map((s) => s.fits), [true, true, false]);
  assert.equal(slots.length, 3);
});

test('FT-14 rescheduling a long service onto overlapping slots keeps counters right', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 1, serviceMinutes: 120 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;
  const r = await api.patch(`/bookings/${id}/reschedule`, { slotId: slots[1].id }, auth(owner.token));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(await Promise.all(slots.map(async (s) => (await slotState(s.id)).booked_count)), [0, 1, 1]);
});

test('FT-15 the database itself refuses an unverified review, even with application code bypassed', async () => {
  const { garageId, serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const booking = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking;
  const insert = (customerId, gId = garageId) => db.query(
    'INSERT INTO reviews (booking_id, garage_id, customer_id, rating) VALUES (?, ?, ?, 5)', [booking.id, gId, customerId]);

  await assert.rejects(insert(owner.id), /completed/, 'booking is not completed');

  await db.query("UPDATE bookings SET status = 'completed' WHERE id = ?", [booking.id]);
  const stranger = await register('owner');
  await assert.rejects(insert(stranger.id), /your own/, 'reviewer is not the customer');
  const other = await setupGarage();
  await assert.rejects(insert(owner.id, other.garageId), /match/, 'wrong garage');

  await insert(owner.id);
  await assert.rejects(insert(owner.id), /Duplicate/, 'one review per booking');
});

test('FT-16 the database itself refuses overselling, even with application code bypassed', async () => {
  const { slots } = await setupGarage({ bayCapacity: 1 });
  await assert.rejects(db.query('UPDATE slots SET booked_count = capacity + 1 WHERE id = ?', [slots[0].id]), /chk_slot_capacity/);
  await assert.rejects(db.query('UPDATE slots SET booked_count = -1 WHERE id = ?', [slots[0].id]), /chk_slot_capacity/);
});

test('FT-17 service tracker: forward only, operator only, not before the appointment day', async () => {
  const { operator, serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;

  let r = await api.patch(`/bookings/${id}/stage`, { stage: 'received' }, auth(operator.token));
  assert.equal(r.status, 409, 'appointment is in the future');

  await moveSlotToPast(slots[0].id);
  assert.equal((await api.patch(`/bookings/${id}/stage`, { stage: 'received' }, auth(owner.token))).status, 403);
  assert.equal((await api.patch(`/bookings/${id}/stage`, { stage: 'nonsense' }, auth(operator.token))).status, 400);
  assert.equal((await api.patch(`/bookings/${id}/stage`, { stage: 'received' }, auth(operator.token))).status, 200);
  assert.equal((await api.patch(`/bookings/${id}/stage`, { stage: 'ready' }, auth(operator.token))).data.booking.job_stage, 'ready');
  assert.equal((await api.patch(`/bookings/${id}/stage`, { stage: 'in_service' }, auth(operator.token))).status, 409, 'cannot go backwards');

  const detail = await api.get(`/bookings/${id}`, auth(owner.token));
  assert.deepEqual(detail.data.events.map((e) => e.event), ['booked', 'received', 'ready']);
});

test('FT-18 customer can confirm a service only after the grace period', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;

  assert.equal((await api.patch(`/bookings/${id}/confirm-service`, {}, auth(owner.token))).status, 409);
  await moveSlotToPast(slots[0].id);
  const stranger = await register('owner');
  assert.equal((await api.patch(`/bookings/${id}/confirm-service`, {}, auth(stranger.token))).status, 403);

  const r = await api.patch(`/bookings/${id}/confirm-service`, {}, auth(owner.token));
  assert.equal(r.status, 200);
  assert.equal(r.data.booking.status, 'completed');
  assert.equal(r.data.booking.completed_by, 'customer');
  assert.equal((await api.post(`/bookings/${id}/review`, { rating: 2 }, auth(owner.token))).status, 201);
});

test('FT-19 admin moderation: a hidden review leaves the list and the rating', async () => {
  const { owner, booking, garageId } = await completedBooking();
  const review = (await api.post(`/bookings/${booking.id}/review`, { rating: 1, comment: 'x' }, auth(owner.token))).data.review;
  assert.equal(Number((await api.get(`/garages/${garageId}`)).data.garage.review_count), 1);

  const admin = await adminToken();
  assert.equal((await api.patch(`/admin/reviews/${review.id}`, { hidden: true }, auth(admin))).status, 400, 'reason required');
  assert.equal((await api.patch(`/admin/reviews/${review.id}`, { hidden: true, reason: 'x' }, auth(owner.token))).status, 403);
  assert.equal((await api.patch(`/admin/reviews/${review.id}`, { hidden: true, reason: 'Abusive' }, auth(admin))).status, 200);

  assert.equal((await api.get(`/garages/${garageId}/reviews`)).data.reviews.length, 0);
  assert.equal(Number((await api.get(`/garages/${garageId}`)).data.garage.review_count), 0);
});

test('FT-20 only an admin can verify a garage', async () => {
  const { operator, garageId } = await setupGarage();
  assert.equal((await api.put(`/garages/${garageId}`, { isVerified: true }, auth(operator.token))).status, 403);
  const admin = await adminToken();
  assert.equal((await api.put(`/garages/${garageId}`, { isVerified: true }, auth(admin))).status, 200);
  assert.equal((await api.get(`/garages/${garageId}`)).data.garage.is_verified, 1);
});

test('FT-21 payment amounts come from the server: deposit then balance, then fully paid', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;
  const pay = async (paymentType, extra = {}) => api.post(`/bookings/${id}/payments`, { paymentType, ...extra }, auth(owner.token));

  const stranger = await register('owner');
  assert.equal((await api.post(`/bookings/${id}/payments`, { paymentType: 'full' }, auth(stranger.token))).status, 403);
  assert.equal((await pay('everything')).status, 400);

  const deposit = await pay('deposit', { amount: 1 });
  assert.equal(deposit.status, 201);
  assert.equal(Number(deposit.data.payment.amount), 200, 'ignores the amount sent by the client');
  assert.equal((await api.post(`/payments/${deposit.data.payment.id}/simulate`, { outcome: 'success' }, auth(stranger.token))).status, 403);
  assert.equal((await api.post(`/payments/${deposit.data.payment.id}/simulate`, { outcome: 'success' }, auth(owner.token))).data.payment.status, 'paid');
  assert.equal((await pay('deposit')).status, 409, 'deposit only once');

  const balance = await pay('full');
  assert.equal(Number(balance.data.payment.amount), 800);
  await api.post(`/payments/${balance.data.payment.id}/simulate`, { outcome: 'success' }, auth(owner.token));
  assert.equal((await pay('full')).status, 409, 'already paid');

  const booking = (await api.get(`/bookings/${id}`, auth(owner.token))).data.booking;
  assert.equal(Number(booking.amount_paid), 1000);
});

test('FT-22 cancelling refunds simulated payments; failed payments never count as paid', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;

  const first = (await api.post(`/bookings/${id}/payments`, { paymentType: 'full' }, auth(owner.token))).data.payment;
  await api.post(`/payments/${first.id}/simulate`, { outcome: 'failure' }, auth(owner.token));
  assert.equal(Number((await api.get(`/bookings/${id}`, auth(owner.token))).data.booking.amount_paid), 0);

  const second = (await api.post(`/bookings/${id}/payments`, { paymentType: 'full' }, auth(owner.token))).data.payment;
  await api.post(`/payments/${second.id}/simulate`, { outcome: 'success' }, auth(owner.token));
  await api.patch(`/bookings/${id}/cancel`, {}, auth(owner.token));

  const payments = (await api.get(`/bookings/${id}/payments`, auth(owner.token))).data.payments;
  assert.equal(payments.find((p) => p.id === second.id).status, 'refunded');
  assert.equal((await api.post(`/bookings/${id}/payments`, { paymentType: 'full' }, auth(owner.token))).status, 409);
});

test('FT-23 a forged PayHere notification cannot mark a booking as paid', async () => {
  const body = new URLSearchParams({ merchant_id: 'x', order_id: 'GB1', payhere_amount: '1', payhere_currency: 'LKR', status_code: '2', md5sig: 'FORGED' });
  const r = await api.post('/payments/payhere/notify', body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 400);
});

test('FT-24 inspection-priced services are paid at the garage, not online', async () => {
  const { operator, garageId, slots } = await setupGarage({ bayCapacity: 2 });
  const service = (await api.post(`/garages/${garageId}/services`, { name: 'Diagnosis', price: 1500, priceType: 'inspection', durationMinutes: 30 }, auth(operator.token))).data.service;
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId: service.id }, auth(owner.token))).data.booking.id;
  assert.equal((await api.post(`/bookings/${id}/payments`, { paymentType: 'full' }, auth(owner.token))).status, 409);
});

test('FT-25 vehicle type: search and booking respect what a service covers', async () => {
  const { operator, garageId, slots } = await setupGarage({ bayCapacity: 2 });
  const service = (await api.post(`/garages/${garageId}/services`, { name: 'Bike tune-up', price: 900, vehicleTypes: ['motorcycle'], durationMinutes: 30 }, auth(operator.token))).data.service;
  const owner = await register('owner');
  assert.equal((await api.post('/bookings', { slotId: slots[0].id, serviceId: service.id, vehicleType: 'car' }, auth(owner.token))).status, 400);
  assert.equal((await api.post('/bookings', { slotId: slots[0].id, serviceId: service.id, vehicleType: 'spaceship' }, auth(owner.token))).status, 400);
  assert.equal((await api.post('/bookings', { slotId: slots[0].id, serviceId: service.id, vehicleType: 'motorcycle' }, auth(owner.token))).status, 201);

  // Price compared is the price of the service searched for, not the cheapest job.
  const found = (await api.get('/garages', { params: { q: 'Test Service' } })).data.garages.find((g) => g.id === garageId);
  assert.equal(Number(found.min_price), 1000);
});

test('FT-26 changing bay capacity updates future slots but never below what is sold', async () => {
  const { operator, garageId, serviceId, slots } = await setupGarage({ bayCapacity: 3 });
  for (let i = 0; i < 2; i += 1) {
    const c = await register('owner');
    await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(c.token));
  }
  await api.put(`/garages/${garageId}`, { bayCapacity: 1 }, auth(operator.token));
  assert.equal((await slotState(slots[0].id)).capacity, 2, 'two bays are already sold');
  assert.equal((await slotState(slots[1].id)).capacity, 1);
});

test('FT-27 changing the hours rebuilds free slots, keeps booked ones, and creates no overlaps', async () => {
  const { operator, garageId, serviceId, slots, date } = await setupGarage({ bayCapacity: 1 });
  const owner = await register('owner');
  await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token));

  const r = await api.put(`/garages/${garageId}`, { slotDurationMinutes: 45 }, auth(operator.token));
  assert.equal(r.status, 200);
  const after = (await api.get(`/garages/${garageId}/slots`, { params: { date } })).data.slots;
  assert.ok(after.some((s) => s.id === slots[0].id), 'the booked slot survives');
  for (let i = 1; i < after.length; i += 1) {
    assert.ok(after[i].start_time >= after[i - 1].end_time, `overlap at ${after[i].start_time}`);
  }
});

test('FT-28 closed weekdays are skipped when generating slots', async () => {
  const { operator, garageId } = await setupGarage();
  const weekday = new Date(`${isoLocal(5)}T12:00:00`).getDay();
  await api.put(`/garages/${garageId}`, { closedWeekdays: String(weekday) }, auth(operator.token));
  await api.post(`/garages/${garageId}/slots/generate`, { fromDate: isoLocal(4), toDate: isoLocal(6) }, auth(operator.token));
  assert.equal((await api.get(`/garages/${garageId}/slots`, { params: { date: isoLocal(5) } })).data.slots.length, 0);
  assert.ok((await api.get(`/garages/${garageId}/slots`, { params: { date: isoLocal(4) } })).data.slots.length > 0);
});

test('FT-29 reminders: sent once, resent after rescheduling, never for other bookings', async () => {
  const { runReminders } = require('../src/jobs/reminderJob');
  const pool = require('../src/config/db');
  const { serviceId, slots, date } = await setupGarage({ bayCapacity: 1, daysAhead: 1 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;
  const reminders = async () => (await db.query("SELECT COUNT(*) AS c FROM notifications WHERE booking_id = ? AND kind = 'reminder' AND channel = 'email'", [id]))[0][0].c;

  const at = new Date(`${date}T08:00:00`); // one hour before the 09:00 slot
  await runReminders(at);
  assert.equal(await reminders(), 1);
  await runReminders(at);
  assert.equal(await reminders(), 1, 'must not send twice');

  await api.patch(`/bookings/${id}/reschedule`, { slotId: slots[1].id }, auth(owner.token));
  await runReminders(at);
  assert.equal(await reminders(), 2, 'a new time gets a new reminder');
  await pool.end();
});

test('FT-30 malformed ids and types return 400, never 500 or a query change', async () => {
  const { serviceId } = await setupGarage();
  const owner = await register('owner');
  const bad = [
    await api.post('/bookings', { slotId: { id: 1 }, serviceId }, auth(owner.token)),
    await api.post('/bookings', { slotId: 'abc', serviceId }, auth(owner.token)),
    await api.post('/auth/login', { email: { a: 1 }, password: 'x' }),
    await api.post('/auth/register', { name: { a: 1 }, email: 'z@z.lk', password: 'password' }),
    await api.post('/auth/register', { name: 'x', email: 'y@z.lk', password: 'password', phone: 'x'.repeat(50) })
  ];
  bad.forEach((r) => assert.equal(r.status, 400, JSON.stringify(r.data)));
});

test('FT-31 deleting a service or garage with bookings is refused cleanly', async () => {
  const { operator, garageId, serviceId, slots } = await setupGarage();
  const owner = await register('owner');
  await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token));
  assert.equal((await api.delete(`/services/${serviceId}`, auth(operator.token))).status, 409);
  assert.equal((await api.delete(`/garages/${garageId}`, auth(operator.token))).status, 409);
});

test('FT-32 an admin cannot remove their own admin role', async () => {
  const token = await adminToken();
  const me = (await api.get('/auth/me', auth(token))).data.user;
  assert.equal((await api.patch(`/users/${me.id}/role`, { role: 'owner' }, auth(token))).status, 409);
});

test('FT-33 operator analytics: ownership enforced and figures add up', async () => {
  const { operator, garageId, serviceId, slots } = await setupGarage({ bayCapacity: 3 });
  const other = await setupGarage();
  assert.equal((await api.get(`/garages/${garageId}/stats`, auth(other.operator.token))).status, 403);

  const customers = await Promise.all([register('owner'), register('owner')]);
  const a = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(customers[0].token))).data.booking.id;
  const b = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(customers[1].token))).data.booking.id;
  await moveSlotToPast(slots[0].id);
  await api.patch(`/bookings/${a}/status`, { status: 'completed' }, auth(operator.token));
  await api.patch(`/bookings/${b}/status`, { status: 'no_show' }, auth(operator.token));

  const { stats } = (await api.get(`/garages/${garageId}/stats`, auth(operator.token))).data;
  assert.equal(stats.total, 2);
  assert.equal(stats.no_show_rate, 50);
  assert.equal(stats.completed_value, 1000);
});

test('FT-34 slot delete after a cancelled booking is refused cleanly, not a 500', async () => {
  const { operator, serviceId, slots } = await setupGarage();
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;
  await api.patch(`/bookings/${id}/cancel`, {}, auth(owner.token));
  assert.equal((await api.delete(`/slots/${slots[0].id}`, auth(operator.token))).status, 409);
  assert.equal((await api.delete(`/slots/${slots[1].id}`, auth(operator.token))).status, 204);
});

// ---- Early completion and the mandatory-review rule -------------------------

// A booking whose slot is later today, so "the appointment hasn't started yet"
// is true without waiting. 23:30 keeps it in the future for any realistic run.
async function laterTodayBooking() {
  const { operator, serviceId, slots, garageId } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;
  await db.query("UPDATE slots SET slot_date = ?, start_time = '23:30:00', end_time = '23:59:00' WHERE id = ?", [isoLocal(0), slots[0].id]);
  return { operator, owner, id, serviceId, slots, garageId };
}

test('FT-35 a job that is in service can be completed before its booked time; a no-show cannot', async () => {
  const { operator, owner, id } = await laterTodayBooking();

  let r = await api.patch(`/bookings/${id}/status`, { status: 'completed' }, auth(operator.token));
  assert.equal(r.status, 409, 'nothing has started and the time has not come');

  await api.patch(`/bookings/${id}/stage`, { stage: 'received' }, auth(operator.token));
  r = await api.patch(`/bookings/${id}/status`, { status: 'completed' }, auth(operator.token));
  assert.equal(r.status, 409, 'received alone is not work under way');

  await api.patch(`/bookings/${id}/stage`, { stage: 'in_service' }, auth(operator.token));
  assert.equal((await api.patch(`/bookings/${id}/status`, { status: 'no_show' }, auth(operator.token))).status, 409, 'a no-show needs the time to have passed');
  await api.patch(`/bookings/${id}/stage`, { stage: 'ready' }, auth(operator.token));

  r = await api.patch(`/bookings/${id}/status`, { status: 'completed' }, auth(operator.token));
  assert.equal(r.status, 200);
  assert.equal(r.data.booking.status, 'completed');
  assert.equal(r.data.booking.job_stage, 'finished');
  assert.equal((await api.post(`/bookings/${id}/review`, { rating: 5 }, auth(owner.token))).status, 201);
});

test('FT-36 a future-day booking can never be completed early, whatever the stage', async () => {
  const { operator, serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;
  assert.equal((await api.patch(`/bookings/${id}/stage`, { stage: 'in_service' }, auth(operator.token))).status, 409, 'tracker is closed until the day');
  assert.equal((await api.patch(`/bookings/${id}/status`, { status: 'completed' }, auth(operator.token))).status, 409);
});

test('FT-37 mandatory review: a completed, unreviewed booking blocks the next booking', async () => {
  const { operator, serviceId, slots } = await setupGarage({ bayCapacity: 3 });
  const owner = await register('owner');
  const first = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;

  assert.equal((await api.get('/bookings/my/pending-reviews', auth(owner.token))).data.pending.length, 0);
  assert.equal((await api.post('/bookings', { slotId: slots[1].id, serviceId }, auth(owner.token))).status, 201, 'a merely confirmed booking does not block');

  await moveSlotToPast(slots[0].id);
  await api.patch(`/bookings/${first}/status`, { status: 'completed' }, auth(operator.token));

  const pending = (await api.get('/bookings/my/pending-reviews', auth(owner.token))).data;
  assert.equal(pending.required, true);
  assert.equal(pending.pending.length, 1);
  assert.equal(pending.pending[0].booking_id, first);

  const blocked = await api.post('/bookings', { slotId: slots[2].id, serviceId }, auth(owner.token));
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'REVIEW_REQUIRED');
  assert.equal(blocked.data.pending[0].booking_id, first);
  assert.match(blocked.data.message, /review/i);
  assert.equal((await slotState(slots[2].id)).booked_count, 0, 'a blocked attempt must not take a bay');

  // Other things the customer needs are not blocked.
  const other = (await api.get('/bookings/my', auth(owner.token))).data.bookings.find((b) => b.status === 'confirmed');
  assert.equal((await api.patch(`/bookings/${other.id}/cancel`, {}, auth(owner.token))).status, 200, 'cancelling is allowed');

  // Someone else is unaffected.
  const stranger = await register('owner');
  assert.equal((await api.post('/bookings', { slotId: slots[2].id, serviceId }, auth(stranger.token))).status, 201);

  assert.equal((await api.post(`/bookings/${first}/review`, { rating: 4 }, auth(owner.token))).status, 201);
  assert.equal((await api.get('/bookings/my/pending-reviews', auth(owner.token))).data.pending.length, 0);
  assert.equal((await api.post('/bookings', { slotId: slots[1].id, serviceId }, auth(owner.token))).status, 201, 'reviewing unblocks booking');
});

test('FT-38 a review an admin hides still counts, so moderation cannot lock a customer out', async () => {
  const { operator, serviceId, slots } = await setupGarage({ bayCapacity: 3 });
  const owner = await register('owner');
  const first = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;
  await moveSlotToPast(slots[0].id);
  await api.patch(`/bookings/${first}/status`, { status: 'completed' }, auth(operator.token));
  const review = (await api.post(`/bookings/${first}/review`, { rating: 1, comment: 'Rude' }, auth(owner.token))).data.review;
  const admin = await adminToken();
  await api.patch(`/admin/reviews/${review.id}`, { hidden: true, reason: 'Abusive' }, auth(admin));
  assert.equal((await api.get('/bookings/my/pending-reviews', auth(owner.token))).data.pending.length, 0);
  assert.equal((await api.post('/bookings', { slotId: slots[1].id, serviceId }, auth(owner.token))).status, 201);
});

test('FT-39 a customer-confirmed service also triggers the review requirement', async () => {
  const { serviceId, slots } = await setupGarage({ bayCapacity: 2 });
  const owner = await register('owner');
  const id = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;
  await moveSlotToPast(slots[0].id);
  await api.patch(`/bookings/${id}/confirm-service`, {}, auth(owner.token));
  const r = await api.post('/bookings', { slotId: slots[1].id, serviceId }, auth(owner.token));
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'REVIEW_REQUIRED');
});

test('FT-40 many simultaneous booking attempts by a blocked customer all fail and take no bay', async () => {
  const { operator, serviceId, slots } = await setupGarage({ bayCapacity: 5 });
  const owner = await register('owner');
  const first = (await api.post('/bookings', { slotId: slots[0].id, serviceId }, auth(owner.token))).data.booking.id;
  await moveSlotToPast(slots[0].id);
  await api.patch(`/bookings/${first}/status`, { status: 'completed' }, auth(operator.token));
  const results = await Promise.all(Array.from({ length: 12 }, () => api.post('/bookings', { slotId: slots[1].id, serviceId }, auth(owner.token))));
  assert.ok(results.every((r) => r.status === 409 && r.data.code === 'REVIEW_REQUIRED'));
  assert.equal((await slotState(slots[1].id)).booked_count, 0);
});
