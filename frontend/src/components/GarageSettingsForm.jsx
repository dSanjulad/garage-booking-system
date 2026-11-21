import React, { useState } from 'react';
import { errorMessage } from '../services/api';
import { Alert, Spinner } from './ui';
import { WEEKDAYS } from '../lib/format';

const BLANK = {
  name: '', description: '', address: '', city: '', phone: '',
  bayCapacity: 1, openingTime: '08:00', closingTime: '18:00', slotDurationMinutes: 60, closedWeekdays: []
};

const toHHMM = (t) => (t ? t.slice(0, 5) : '');

export default function GarageSettingsForm({ initial, onSubmit, submitLabel }) {
  const [form, setForm] = useState(() => (initial ? {
    name: initial.name, description: initial.description || '', address: initial.address, city: initial.city, phone: initial.phone || '',
    bayCapacity: initial.bay_capacity, openingTime: toHHMM(initial.opening_time), closingTime: toHHMM(initial.closing_time),
    slotDurationMinutes: initial.slot_duration_minutes,
    closedWeekdays: (initial.closed_weekdays || '').split(',').filter(Boolean).map(Number)
  } : BLANK));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (key) => (e) => { setSaved(false); setForm((f) => ({ ...f, [key]: e.target.value })); };
  const toggleDay = (n) => {
    setSaved(false);
    setForm((f) => ({ ...f, closedWeekdays: f.closedWeekdays.includes(n) ? f.closedWeekdays.filter((d) => d !== n) : [...f.closedWeekdays, n] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        bayCapacity: Number(form.bayCapacity),
        slotDurationMinutes: Number(form.slotDurationMinutes),
        openingTime: `${form.openingTime}:00`,
        closingTime: `${form.closingTime}:00`,
        closedWeekdays: [...form.closedWeekdays].sort().join(',')
      });
      if (initial) setSaved(true); else setForm(BLANK);
    } catch (err) {
      setError(errorMessage(err, "The garage couldn't be saved. Check the details and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <Alert>{error}</Alert>}
      {saved && <Alert kind="success">Changes saved. Free future time slots now follow these settings.</Alert>}
      <div className="field">
        <label htmlFor="g-name">Garage name</label>
        <input id="g-name" required maxLength={150} value={form.name} onChange={update('name')} />
      </div>
      <div className="field">
        <label htmlFor="g-desc">Description</label>
        <textarea id="g-desc" rows={2} maxLength={2000} value={form.description} onChange={update('description')} />
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="g-address">Address</label><input id="g-address" required maxLength={255} value={form.address} onChange={update('address')} /></div>
        <div className="field"><label htmlFor="g-city">City</label><input id="g-city" required maxLength={100} value={form.city} onChange={update('city')} /></div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="g-phone">Phone</label><input id="g-phone" type="tel" maxLength={30} value={form.phone} onChange={update('phone')} /></div>
        <div className="field">
          <label htmlFor="g-bays">Service bays</label>
          <input id="g-bays" type="number" min={1} max={50} required value={form.bayCapacity} onChange={update('bayCapacity')} />
          <span className="hint">How many vehicles you can work on at the same time.</span>
        </div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="g-open">Opening time</label><input id="g-open" type="time" required value={form.openingTime} onChange={update('openingTime')} /></div>
        <div className="field"><label htmlFor="g-close">Closing time</label><input id="g-close" type="time" required value={form.closingTime} onChange={update('closingTime')} /></div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="g-slot">Length of each time slot (minutes)</label>
          <input id="g-slot" type="number" min={15} max={240} step={5} required value={form.slotDurationMinutes} onChange={update('slotDurationMinutes')} />
          <span className="hint">Longer services automatically take several slots in a row.</span>
        </div>
        <fieldset className="field day-picker">
          <legend className="label">Closed on</legend>
          <div className="row">
            {WEEKDAYS.map(([n, label]) => (
              <button key={n} type="button" aria-pressed={form.closedWeekdays.includes(n)} className={`day ${form.closedWeekdays.includes(n) ? 'is-on' : ''}`} onClick={() => toggleDay(n)}>{label}</button>
            ))}
          </div>
        </fieldset>
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <><Spinner />Saving</> : submitLabel}</button>
    </form>
  );
}
