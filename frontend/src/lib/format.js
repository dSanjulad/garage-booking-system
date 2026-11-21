export const money = (n) => `Rs. ${Number(n).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
export const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

const parse = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const weekday = (iso, style = 'short') => parse(iso).toLocaleDateString('en-GB', { weekday: style });
export const dayNum = (iso) => parse(iso).getDate();
export const monthShort = (iso) => parse(iso).toLocaleDateString('en-GB', { month: 'short' });
export const longDate = (iso) => parse(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// "Today", "Tomorrow" or the weekday, for a datetime string from the API.
export function whenLabel(dateTime) {
  const [d, t] = String(dateTime).split(/[ T]/);
  const today = new Date();
  const dt = parse(d);
  const diff = Math.round((dt - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : weekday(d);
  return { day, time: hhmm(t) };
}

export const VEHICLES = [
  { value: 'car', label: 'Car' },
  { value: 'suv', label: 'SUV / jeep' },
  { value: 'van', label: 'Van' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'three_wheeler', label: 'Three-wheeler' },
  { value: 'lorry', label: 'Lorry' }
];
export const vehicleLabel = (v) => VEHICLES.find((x) => x.value === v)?.label || v;

export const PRICE_TYPES = {
  fixed: { label: 'Fixed price', prefix: '' },
  starting_from: { label: 'Starting from', prefix: 'from ' },
  inspection: { label: 'Quoted after inspection', prefix: 'from ' }
};
export const priceText = (price, type) => `${PRICE_TYPES[type]?.prefix || ''}${money(price)}`;

export const WEEKDAYS = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']
];

export const homeForRole = (role) => (role === 'admin' ? '/admin' : role === 'operator' ? '/dashboard' : '/');
