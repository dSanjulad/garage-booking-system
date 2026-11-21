// Sends any reminders that are due, once, then exits. The API sends these on
// its own schedule; this is for running it by hand or from an external cron.
require('dotenv').config();
const pool = require('../src/config/db');
const { runReminders } = require('../src/jobs/reminderJob');

runReminders()
  .then(({ due, sent }) => {
    console.log(`${due} reminder(s) due, ${sent} processed.`);
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
