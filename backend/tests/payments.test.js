// Unit tests: no server or database needed. The expected values are computed
// independently of the code under test, using the formula in PayHere's docs.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const payhere = require('../src/services/payments/payhereProvider');
const { annotateSlots, slotsNeeded, consecutiveRun, isClosedOn } = require('../src/utils/timeSlots');
const { splitStatements } = require('../src/db/reset');

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').toUpperCase();
const SECRET = 'test-secret';

test('PayHere checkout hash matches the documented formula', () => {
  const expected = md5(`1211149GB1-abc1000.00LKR${md5(SECRET)}`);
  assert.equal(payhere.checkoutHash({ merchantId: '1211149', orderId: 'GB1-abc', amount: '1000.00', currency: 'LKR', merchantSecret: SECRET }), expected);
});

test('PayHere notification: a correct signature is accepted', () => {
  const body = { merchant_id: '1211149', order_id: 'GB1-abc', payhere_amount: '1000.00', payhere_currency: 'LKR', status_code: '2' };
  body.md5sig = md5(`1211149GB1-abc1000.00LKR2${md5(SECRET)}`);
  assert.equal(payhere.verifyNotification(body, SECRET), true);
});

test('PayHere notification: tampering with the amount or status is rejected', () => {
  const body = { merchant_id: '1211149', order_id: 'GB1-abc', payhere_amount: '1000.00', payhere_currency: 'LKR', status_code: '-2' };
  body.md5sig = md5(`1211149GB1-abc1000.00LKR-2${md5(SECRET)}`);
  assert.equal(payhere.verifyNotification({ ...body, status_code: '2' }, SECRET), false);
  assert.equal(payhere.verifyNotification({ ...body, payhere_amount: '1.00' }, SECRET), false);
});

test('PayHere notification: rejected when no secret is configured or no signature sent', () => {
  assert.equal(payhere.verifyNotification({ md5sig: 'x' }, ''), false);
  assert.equal(payhere.verifyNotification({}, SECRET), false);
});

test('PayHere status codes map correctly', () => {
  assert.equal(payhere.statusFromCode('2'), 'paid');
  assert.equal(payhere.statusFromCode('0'), 'pending');
  for (const code of ['-1', '-2', '-3']) assert.equal(payhere.statusFromCode(code), 'failed');
});

const slot = (start, end, booked = 0, capacity = 1) => ({ slot_date: '2099-01-01', start_time: `${start}:00:00`, end_time: `${end}:00:00`, booked_count: booked, capacity });

test('slotsNeeded rounds up and is never below one', () => {
  assert.equal(slotsNeeded(120, 45), 3);
  assert.equal(slotsNeeded(45, 45), 1);
  assert.equal(slotsNeeded(10, 60), 1);
});

test('annotateSlots: a long service only fits where enough consecutive bays are free', () => {
  const slots = [slot('09', '10'), slot('10', '11', 1), slot('11', '12'), slot('12', '13')];
  assert.deepEqual(annotateSlots(slots, 2).map((s) => s.fits), [false, false, true, false]);
  assert.deepEqual(annotateSlots(slots, 1).map((s) => s.fits), [true, false, true, true]);
});

test('consecutiveRun refuses a gap in the day', () => {
  assert.equal(consecutiveRun([slot('09', '10'), slot('11', '12')], 0, 2), null);
});

test('isClosedOn reads weekdays regardless of server timezone', () => {
  assert.equal(isClosedOn('2026-11-08', '0'), true); // a Sunday
  assert.equal(isClosedOn('2026-11-09', '0'), false);
  assert.equal(isClosedOn('2026-11-09', ''), false);
});

test('schema splitter handles trigger bodies and DELIMITER', () => {
  const parts = splitStatements('-- c\nCREATE TABLE a (b INT);\nDELIMITER $$\nCREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW\nBEGIN\n  SET @x = 1;\nEND$$\nDELIMITER ;\nSELECT 1;');
  assert.equal(parts.length, 3);
  assert.ok(parts[1].includes('SET @x = 1;'));
});
