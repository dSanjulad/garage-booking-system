// Turns "08:00:00".."18:00:00" + a duration into a list of
// [{ startTime, endTime }] slot boundaries, e.g. 60-minute slots from
// 08:00 to 18:00 produces 10 slots: 08:00-09:00, 09:00-10:00, ... 17:00-18:00.
function toMinutes(hhmmss) {
  const [h, m] = hhmmss.split(':').map(Number);
  return h * 60 + m;
}

function toHHMMSS(totalMinutes) {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return `${h}:${m}:00`;
}

function buildSlotBoundaries(openingTime, closingTime, durationMinutes) {
  const start = toMinutes(openingTime);
  const end = toMinutes(closingTime);
  const boundaries = [];

  for (let t = start; t + durationMinutes <= end; t += durationMinutes) {
    boundaries.push({ startTime: toHHMMSS(t), endTime: toHHMMSS(t + durationMinutes) });
  }
  return boundaries;
}

// Inclusive list of ISO date strings between two dates, e.g.
// dateRange('2026-08-10', '2026-08-12') -> ['2026-08-10','2026-08-11','2026-08-12']
function dateRange(fromDate, toDate) {
  // Work entirely in UTC so the result never shifts by a day on servers
  // whose local timezone is ahead of / behind UTC (e.g. Asia/Colombo, UTC+5:30).
  const dates = [];
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// Today's date and the current time-of-day as the *server's local clock*
// sees them (Asia/Colombo on a Sri Lankan deployment). Never derive these
// from toISOString(), which is UTC and is a day behind for the first 5.5
// hours of every Sri Lankan day.
function todayLocalISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// True if a slot (DATE string + TIME string, both local) has already started.
function slotHasStarted(slotDate, startTime, now = new Date()) {
  return new Date(`${slotDate}T${startTime}`) <= now;
}

// How many consecutive slots a service needs: a 120-minute service in a
// 45-minute slot grid occupies 3 slots. Always at least one.
function slotsNeeded(serviceMinutes, slotMinutes) {
  return Math.max(1, Math.ceil(Number(serviceMinutes) / Number(slotMinutes)));
}

function slotLengthMinutes(slot) {
  return toMinutes(slot.end_time) - toMinutes(slot.start_time);
}

// The run of `needed` back-to-back slots beginning at index `start`, or null
// if the day ends first or there is a gap (for example a deleted slot).
function consecutiveRun(sortedSlots, start, needed) {
  const run = sortedSlots.slice(start, start + needed);
  if (run.length < needed) return null;
  for (let i = 1; i < run.length; i += 1) {
    if (run[i].start_time !== run[i - 1].end_time) return null;
  }
  return run;
}

// Adds to each slot of a day: started (time has passed) and fits (a service
// needing `needed` slots can begin here with a free bay in all of them).
function annotateSlots(sortedSlots, needed, now = new Date()) {
  return sortedSlots.map((slot, i) => {
    const started = slotHasStarted(slot.slot_date, slot.start_time, now);
    const run = consecutiveRun(sortedSlots, i, needed);
    const fits = !started && Boolean(run) && run.every((s) => s.booked_count < s.capacity);
    return { ...slot, started, fits };
  });
}

// Days a garage has chosen to close, e.g. '0' for Sundays.
function isClosedOn(dateISO, closedWeekdays) {
  if (!closedWeekdays) return false;
  const [y, m, d] = dateISO.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return closedWeekdays.split(',').includes(String(weekday));
}

module.exports = { slotsNeeded, slotLengthMinutes, consecutiveRun, annotateSlots, isClosedOn, buildSlotBoundaries, dateRange, todayLocalISO, slotHasStarted };
