const bookingModel = require('../models/bookingModel');
const notificationService = require('../services/notificationService');
const { localNow } = require('../models/garageModel');

const HOUR = 60 * 60 * 1000;

// Reminds customers of appointments starting within the next REMINDER_HOURS
// (default 24). Each booking is claimed first, so overlapping runs can't send
// twice; if sending fails the claim is released and the next run retries.
async function runReminders(now = new Date()) {
  const windowMs = (Number(process.env.REMINDER_HOURS) || 24) * HOUR;
  const due = await bookingModel.findDueReminders(localNow(now), localNow(new Date(now.getTime() + windowMs)));

  let sent = 0;
  for (const booking of due) {
    if (!(await bookingModel.claimReminder(booking.id))) continue;
    try {
      await notificationService.sendBookingReminder(booking);
      sent += 1;
    } catch (err) {
      console.error(`[reminder] booking ${booking.id}: ${err.message}`);
      await bookingModel.releaseReminder(booking.id);
    }
  }
  return { due: due.length, sent };
}

// Runs inside the API process, so no external scheduler is needed for the
// prototype. Set REMINDERS_ENABLED=false to turn it off.
function startReminderSchedule() {
  if (process.env.REMINDERS_ENABLED === 'false') return null;
  const everyMs = (Number(process.env.REMINDER_INTERVAL_MINUTES) || 30) * 60 * 1000;
  const tick = () => runReminders().catch((err) => console.error('[reminder]', err.message));
  const timer = setInterval(tick, everyMs);
  timer.unref();
  setTimeout(tick, 5000).unref();
  return timer;
}

module.exports = { runReminders, startReminderSchedule };
