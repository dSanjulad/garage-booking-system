import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { slotService, errorMessage } from '../services/api';
import { todayISO, inDaysISO } from '../utils/date';
import { Alert, Skeleton, Spinner } from './ui';
import { hhmm } from '../lib/format';

export default function AvailabilityManager({ garage }) {
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(inDaysISO(13));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      const res = await slotService.listForGarageAndDate(garage.id, date);
      setSlots(res.data.slots);
    } catch (err) {
      setError(errorMessage(err, "Time slots couldn't be loaded."));
    } finally {
      setLoading(false);
    }
  }, [garage.id, date]);

  useEffect(() => { loadDay(); }, [loadDay]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setGenerating(true);
    try {
      const res = await slotService.generate(garage.id, { fromDate, toDate });
      setMessage(res.data.message);
      await loadDay();
    } catch (err) {
      setError(errorMessage(err, "Time slots couldn't be created."));
    } finally {
      setGenerating(false);
    }
  };

  const removeSlot = async (id) => {
    setError('');
    setMessage('');
    try {
      await slotService.remove(id);
      await loadDay();
    } catch (err) {
      setError(errorMessage(err, "This time slot couldn't be removed."));
    }
  };

  return (
    <div>
      <h2>Availability</h2>
      {message && <Alert kind="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}

      <form onSubmit={handleGenerate} className="generate">
        <p className="muted">Open your calendar for customers. Slots follow your hours ({hhmm(garage.opening_time)} to {hhmm(garage.closing_time)}), {garage.slot_duration_minutes}-minute slots and {garage.bay_capacity} {garage.bay_capacity === 1 ? 'bay' : 'bays'}. Running this again only adds what's missing.</p>
        <div className="generate-row">
          <div className="field"><label htmlFor="a-from">From</label><input id="a-from" type="date" value={fromDate} min={todayISO()} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="a-to">To</label><input id="a-to" type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} /></div>
          <button type="submit" className="btn btn-primary" disabled={generating}>{generating ? <><Spinner />Opening</> : 'Open these dates'}</button>
        </div>
      </form>

      <hr className="divider" />
      <div className="day-head">
        <h3>Time slots on this day</h3>
        <input className="input" type="date" aria-label="Day to view" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {loading ? <Skeleton height={120} /> : slots.length === 0 ? (
        <p className="muted">Nothing is open on this day.</p>
      ) : (
        <ul className="occupancy">
          {slots.map((s) => {
            const pct = s.capacity ? (s.booked_count / s.capacity) * 100 : 0;
            return (
              <li key={s.id}>
                <b className="num">{hhmm(s.start_time)}</b>
                <span className="occupancy-bar" role="img" aria-label={`${s.booked_count} of ${s.capacity} bays booked`}><i style={{ width: `${pct}%` }} /></span>
                <span className="num muted small">{s.booked_count} of {s.capacity} booked</span>
                {s.booked_count === 0 && !s.started ? (
                  <button className="btn btn-ghost btn-sm" aria-label={`Remove the ${hhmm(s.start_time)} slot`} onClick={() => removeSlot(s.id)}><Trash2 size={16} aria-hidden="true" /></button>
                ) : <span />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
