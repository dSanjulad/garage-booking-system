// Unit tests (no server or database needed). Run under different
// timezones to prove the date logic is timezone-independent:
//   TZ=Asia/Colombo node --test tests/timeSlots.test.js
//   TZ=UTC          node --test tests/timeSlots.test.js
//   TZ=America/Los_Angeles node --test tests/timeSlots.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSlotBoundaries, dateRange, todayLocalISO, slotHasStarted } = require('../src/utils/timeSlots');

test('dateRange returns exactly the requested dates (regression: UTC+5:30 shifted by a day)', () => {
  assert.deepEqual(dateRange('2026-10-07', '2026-10-07'), ['2026-10-07']);
  assert.deepEqual(dateRange('2026-10-07', '2026-10-09'), ['2026-10-07', '2026-10-08', '2026-10-09']);
});

test('dateRange crosses month and year boundaries and leap days', () => {
  assert.deepEqual(dateRange('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual(dateRange('2028-02-28', '2028-03-01'), ['2028-02-28', '2028-02-29', '2028-03-01']);
});

test('dateRange is empty when to < from', () => {
  assert.deepEqual(dateRange('2026-10-09', '2026-10-07'), []);
});

test('buildSlotBoundaries: 60-minute slots 08:00-18:00 gives 10 slots', () => {
  const b = buildSlotBoundaries('08:00:00', '18:00:00', 60);
  assert.equal(b.length, 10);
  assert.deepEqual(b[0], { startTime: '08:00:00', endTime: '09:00:00' });
  assert.deepEqual(b[9], { startTime: '17:00:00', endTime: '18:00:00' });
});

test('buildSlotBoundaries: a partial final slot is dropped', () => {
  const b = buildSlotBoundaries('08:30:00', '18:00:00', 45); // 570 min / 45 = 12.67 -> 12 slots
  assert.equal(b.length, 12);
  assert.equal(b[11].endTime, '17:30:00');
});

test('buildSlotBoundaries: window shorter than one slot gives none', () => {
  assert.equal(buildSlotBoundaries('09:00:00', '09:30:00', 60).length, 0);
});

test('todayLocalISO uses the local calendar day', () => {
  assert.equal(todayLocalISO(new Date(2026, 9, 7, 0, 30)), '2026-10-07'); // 00:30 local
  assert.equal(todayLocalISO(new Date(2026, 9, 7, 23, 59)), '2026-10-07');
});

test('slotHasStarted compares against the supplied clock', () => {
  const now = new Date(2026, 9, 7, 10, 0, 0);
  assert.equal(slotHasStarted('2026-10-07', '09:00:00', now), true);
  assert.equal(slotHasStarted('2026-10-07', '10:00:00', now), true);  // starts now
  assert.equal(slotHasStarted('2026-10-07', '10:00:01', now), false);
  assert.equal(slotHasStarted('2026-10-08', '08:00:00', now), false);
});
