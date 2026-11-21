// Dates in the browser's local timezone (Asia/Colombo for Sri Lankan users).
// new Date().toISOString() is UTC and is "yesterday" for the first 5.5 hours
// of every Sri Lankan day, so never use it to get today's date for a picker.
function pad(n) { return String(n).padStart(2, '0'); }

export function toLocalISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return toLocalISO(new Date());
}

export function inDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}
