require('dotenv').config();
// Slot times are local to Sri Lanka, whatever timezone the server is in.
process.env.TZ = process.env.TZ || 'Asia/Colombo';

const app = require('./app');
const { startReminderSchedule } = require('./jobs/reminderJob');

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET must be set in production.');
  process.exit(1);
}

const PORT = process.env.PORT || 8081;

app.listen(PORT, () => {
  console.log(`GarageBookLK API listening on http://localhost:${PORT}`);
  startReminderSchedule();
});
