const nodemailer = require('nodemailer');
const notificationModel = require('../models/notificationModel');
require('dotenv').config();

// Without SMTP settings (usual for local development and marking), messages
// are written to the log and recorded as "logged", so the whole booking flow
// still works and the notification history stays honest about what happened.
function buildTransport() {
  if (!process.env.SMTP_HOST) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
  });
}
const transporter = buildTransport();

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Email: a short HTML card plus a plain-text copy for clients that want it.
function renderEmail({ heading, intro, rows = [], footer }) {
  const text = [intro, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', footer].filter((l) => l !== undefined).join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#16233a">
    <div style="background:#16233a;color:#ffd21f;padding:18px 24px;font-size:20px;font-weight:bold">GarageBookLK</div>
    <div style="padding:24px;border:1px solid #d9dfe7;border-top:0">
      <h2 style="margin:0 0 8px;font-size:20px">${escapeHtml(heading)}</h2>
      <p style="margin:0 0 16px">${escapeHtml(intro)}</p>
      <table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr>
        <td style="padding:6px 12px 6px 0;color:#566378;white-space:nowrap">${escapeHtml(k)}</td>
        <td style="padding:6px 0;font-weight:bold">${escapeHtml(v)}</td></tr>`).join('')}</table>
      ${footer ? `<p style="margin:16px 0 0;color:#566378">${escapeHtml(footer)}</p>` : ''}
    </div></div>`;
  return { text, html };
}

async function sendEmail({ to, subject, text, html, kind = 'general', bookingId }) {
  if (!transporter) {
    console.log(`[email:logged] To: ${to} | ${subject}`);
    await notificationModel.record({ bookingId, kind, channel: 'email', recipient: to, subject, status: 'logged', detail: 'SMTP not configured' });
    return { delivered: false, reason: 'SMTP not configured' };
  }
  try {
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
    await notificationModel.record({ bookingId, kind, channel: 'email', recipient: to, subject, status: 'sent' });
    return { delivered: true };
  } catch (err) {
    await notificationModel.record({ bookingId, kind, channel: 'email', recipient: to, subject, status: 'failed', detail: err.message });
    throw err;
  }
}

// SMS is the optional second channel. A real gateway needs a paid account, so
// this logs instead; it keeps the same shape so a provider can be added here
// without changing any calling code.
async function sendSms({ to, text, kind = 'general', bookingId }) {
  if (!to) return { delivered: false, reason: 'No phone number on file' };
  console.log(`[sms:logged] To: ${to} | ${text}`);
  await notificationModel.record({ bookingId, kind, channel: 'sms', recipient: to, subject: text, status: 'logged', detail: 'No SMS gateway configured' });
  return { delivered: false, reason: 'No SMS gateway configured' };
}

const t = (time) => String(time).slice(0, 5);
const bookingRows = (b) => [
  ['Garage', `${b.garage_name}, ${b.garage_address}, ${b.garage_city}`],
  ['Service', b.service_name],
  ['Date', b.slot_date],
  ['Time', `${t(b.start_time)} to ${t(b.end_time)}`]
];

async function emailCustomer(b, kind, subject, heading, intro, footer) {
  const { text, html } = renderEmail({ heading, intro, rows: bookingRows(b), footer });
  return sendEmail({ to: b.customer_email, subject, text, html, kind, bookingId: b.id });
}

async function sendBookingConfirmation(b) {
  await emailCustomer(b, 'confirmation', `Booking confirmed at ${b.garage_name}`, 'Your booking is confirmed',
    `Hi ${b.customer_name}, here are the details of your appointment.`,
    'You can reschedule or cancel from My bookings.');
  await sendSms({ to: b.customer_phone, kind: 'confirmation', bookingId: b.id, text: `Booking confirmed: ${b.garage_name}, ${b.slot_date} ${t(b.start_time)}.` });

  const { text, html } = renderEmail({
    heading: 'New booking',
    intro: `${b.customer_name} has booked ${b.service_name}.`,
    rows: [['Date', b.slot_date], ['Time', `${t(b.start_time)} to ${t(b.end_time)}`], ['Phone', b.customer_phone || 'Not given'], ['Notes', b.notes || 'None']]
  });
  await sendEmail({ to: b.operator_email, subject: `New booking: ${b.service_name}, ${b.slot_date}`, text, html, kind: 'operator_new_booking', bookingId: b.id });
}

async function sendBookingReminder(b) {
  await emailCustomer(b, 'reminder', `Reminder: your appointment at ${b.garage_name}`, 'Your appointment is coming up',
    `Hi ${b.customer_name}, this is a reminder of your booking.`,
    "If you can't make it, please cancel from My bookings so someone else can have the slot.");
  await sendSms({ to: b.customer_phone, kind: 'reminder', bookingId: b.id, text: `Reminder: ${b.garage_name}, ${b.slot_date} ${t(b.start_time)}.` });
}

async function sendBookingCancellation(b) {
  await emailCustomer(b, 'cancellation', `Booking cancelled at ${b.garage_name}`, 'Your booking is cancelled',
    `Hi ${b.customer_name}, this booking has been cancelled.`);
}

async function sendBookingRescheduled(b) {
  await emailCustomer(b, 'reschedule', `Booking moved at ${b.garage_name}`, 'Your booking has moved',
    `Hi ${b.customer_name}, here is your new appointment time.`);
}

async function sendVehicleReady(b) {
  await emailCustomer(b, 'ready', `Your vehicle is ready at ${b.garage_name}`, 'Your vehicle is ready to collect',
    `Hi ${b.customer_name}, the garage has finished ${b.service_name}.`);
  await sendSms({ to: b.customer_phone, kind: 'ready', bookingId: b.id, text: `Your vehicle is ready to collect at ${b.garage_name}.` });
}

async function sendReviewRequest(b) {
  await emailCustomer(b, 'review_request', `How was your service at ${b.garage_name}?`, 'Your service is complete',
    `Hi ${b.customer_name}, ${b.garage_name} has marked ${b.service_name} as completed. Please rate your experience.`,
    'Your review is needed before you can make your next booking. It takes under a minute, from My bookings.');
}

module.exports = {
  sendReviewRequest, renderEmail, sendEmail, sendSms, sendBookingConfirmation, sendBookingReminder,
  sendBookingCancellation, sendBookingRescheduled, sendVehicleReady
};
