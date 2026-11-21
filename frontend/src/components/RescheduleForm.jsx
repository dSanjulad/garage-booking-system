import React, { useEffect, useState } from 'react';
import { slotService, bookingService, errorMessage } from '../services/api';
import { DateStrip, SlotGrid } from './SlotPicker';
import { Alert, Spinner } from './ui';

export default function RescheduleForm({ booking, onDone }) {
  const [days, setDays] = useState([]);
  const [date, setDate] = useState(booking.slot_date);
  const [slots, setSlots] = useState([]);
  const [needed, setNeeded] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    slotService.availability(booking.garage_id, 14).then((r) => setDays(r.data.days)).catch(() => {});
  }, [booking.garage_id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectedId(null);
    slotService.listForGarageAndDate(booking.garage_id, date, booking.service_id)
      .then((r) => { if (!cancelled) { setSlots(r.data.slots); setNeeded(r.data.slots_needed); } })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [booking.garage_id, booking.service_id, date]);

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      await bookingService.reschedule(booking.id, selectedId);
      onDone();
    } catch (err) {
      setError(errorMessage(err, "That time couldn't be booked. Please choose another."));
      setSaving(false);
    }
  };

  return (
    <div className="inline-panel">
      {error && <Alert>{error}</Alert>}
      <span className="label">Choose a new date and time</span>
      <DateStrip days={days} value={date} onChange={setDate} />
      <SlotGrid slots={slots} needed={needed} loading={loading} selectedId={selectedId} currentId={booking.slot_id} onSelect={setSelectedId} disabled={saving} />
      <button className="btn btn-dark btn-sm" disabled={!selectedId || saving} onClick={save}>
        {saving ? <><Spinner size={16} />Moving booking</> : 'Move booking'}
      </button>
    </div>
  );
}
