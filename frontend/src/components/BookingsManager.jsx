import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Inbox, Phone } from 'lucide-react';
import { bookingService, errorMessage } from '../services/api';
import { Alert, Empty, Modal, Skeleton, StatusBadge } from './ui';
import { todayISO } from '../utils/date';
import { hhmm, longDate, money, vehicleLabel } from '../lib/format';

const NEXT_STAGE = {
  scheduled: { stage: 'received', label: 'Vehicle received' },
  received: { stage: 'in_service', label: 'Start work' },
  in_service: { stage: 'ready', label: 'Ready to collect' }
};
const STAGE_TEXT = { scheduled: 'Not arrived', received: 'At the garage', in_service: 'Being serviced', ready: 'Ready to collect', finished: 'Finished' };

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'attention', label: 'Needs updating' },
  { key: 'all', label: 'All' }
];

const startOf = (b) => new Date(`${b.slot_date}T${b.start_time}`).getTime();

export default function BookingsManager({ garageId }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('today');
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await bookingService.forGarage(garageId);
      setBookings(res.data.bookings);
    } catch (err) {
      setError(errorMessage(err, "Bookings couldn't be loaded."));
    } finally {
      setLoading(false);
    }
  }, [garageId]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (id, action) => {
    setError('');
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err, "This booking couldn't be updated."));
    } finally {
      setBusyId(null);
    }
  };

  const today = todayISO();
  const now = Date.now();
  const groups = {
    today: bookings.filter((b) => b.slot_date === today && b.status !== 'cancelled'),
    upcoming: bookings.filter((b) => b.slot_date > today && b.status === 'confirmed'),
    attention: bookings.filter((b) => b.status === 'confirmed' && b.slot_date < today),
    all: bookings
  };
  const visible = [...groups[filter]];
  if (filter !== 'all' && filter !== 'attention') visible.sort((a, b) => startOf(a) - startOf(b));

  return (
    <div>
      <h2>Bookings</h2>
      {error && <Alert>{error}</Alert>}
      <div className="filter-row" role="group" aria-label="Filter bookings">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} className={`filter ${filter === f.key ? 'is-on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label} <span className="num">{groups[f.key].length}</span>
          </button>
        ))}
      </div>

      {loading ? <Skeleton height={160} /> : visible.length === 0 ? (
        <Empty icon={Inbox} title="Nothing here">No bookings in this view.</Empty>
      ) : (
        <ul className="bench">
          <AnimatePresence initial={false}>
            {visible.slice(0, 100).map((b) => {
              const started = startOf(b) <= now;
              // Work already under way can be completed ahead of the booked time.
              const workUnderway = b.job_stage === 'in_service' || b.job_stage === 'ready';
              const next = NEXT_STAGE[b.job_stage];
              const busy = busyId === b.id;
              return (
                <motion.li key={b.id} layout="position" className="bench-row" exit={{ opacity: 0 }}>
                  <div className="bench-time">
                    <b className="num">{hhmm(b.start_time)}</b>
                    <small>{b.slot_date === today ? `to ${hhmm(b.end_time)}` : longDate(b.slot_date)}</small>
                  </div>
                  <div className="bench-main">
                    <b>{b.service_name}</b>
                    <div className="sub">
                      {b.customer_name}
                      {b.customer_phone && <a href={`tel:${b.customer_phone}`} className="tel"><Phone size={13} aria-hidden="true" />{b.customer_phone}</a>}
                    </div>
                    <div className="sub">{vehicleLabel(b.vehicle_type)}{b.vehicle_details ? `, ${b.vehicle_details}` : ''}{Number(b.amount_paid) > 0 ? `. ${money(b.amount_paid)} paid` : ''}</div>
                    {b.notes && <div className="bench-note">{b.notes}</div>}
                  </div>
                  <div className="bench-status">
                    <StatusBadge status={b.status} />
                    {b.status === 'confirmed' && <small>{STAGE_TEXT[b.job_stage]}</small>}
                    {b.status === 'completed' && <small>{b.has_review ? 'Customer has reviewed' : 'Awaiting customer review'}</small>}
                    {b.completed_by === 'customer' && <small>Confirmed by customer</small>}
                  </div>
                  <div className="bench-actions">
                    {b.status === 'confirmed' && b.slot_date <= today && next && (
                      <button className="btn btn-dark btn-sm" disabled={busy} onClick={() => run(b.id, () => bookingService.updateStage(b.id, next.stage))}>{next.label}</button>
                    )}
                    {b.status === 'confirmed' && (started || workUnderway) && (
                      <>
                        <button className="btn btn-primary btn-sm" disabled={busy} title="The customer is asked to review before they can book again" onClick={() => run(b.id, () => bookingService.updateStatus(b.id, 'completed'))}>Complete</button>
                        {started && b.job_stage === 'scheduled' && <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(b.id, () => bookingService.updateStatus(b.id, 'no_show'))}>No-show</button>}
                      </>
                    )}
                    {b.status === 'confirmed' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setCancelling(b)}>Cancel</button>}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="Cancel this booking?">
        {cancelling && (
          <>
            <p>{cancelling.customer_name}'s {cancelling.service_name} on {longDate(cancelling.slot_date)} will be cancelled. They'll get an email, and the time goes back on sale.</p>
            <div className="row">
              <button className="btn btn-danger" onClick={() => { const b = cancelling; setCancelling(null); run(b.id, () => bookingService.cancel(b.id)); }}>Cancel booking</button>
              <button className="btn btn-outline" onClick={() => setCancelling(null)}>Keep booking</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
