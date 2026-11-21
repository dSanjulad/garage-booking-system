import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUrlTab } from '../lib/useUrlTab';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, CreditCard, Star, X } from 'lucide-react';
import { bookingService, errorMessage } from '../services/api';
import RescheduleForm from '../components/RescheduleForm';
import ReviewForm from '../components/ReviewForm';
import { useReviewGate } from '../context/ReviewGate';
import ServiceTracker from '../components/ServiceTracker';
import PayDialog from '../components/PayDialog';
import { Alert, Empty, Modal, Skeleton, Spinner, StatusBadge, Tabs } from '../components/ui';
import { dayNum, hhmm, money, monthShort, priceText, vehicleLabel, weekday } from '../lib/format';

const GRACE_HOURS = 24;

// Past the end of the appointment plus the grace period, with the garage silent.
function canSelfConfirm(b) {
  if (b.status !== 'confirmed') return false;
  return Date.now() > new Date(`${b.slot_date}T${b.end_time}`).getTime() + GRACE_HOURS * 3600000;
}

const hasStarted = (b) => new Date(`${b.slot_date}T${b.start_time}`).getTime() <= Date.now();

function BookingCard({ booking: b, onChanged, onError, onCancel, onPay }) {
  const [open, setOpen] = useState(null); // 'reschedule' | 'review'
  const [confirming, setConfirming] = useState(false);
  const toggle = (name) => setOpen((v) => (v === name ? null : name));
  const started = hasStarted(b);
  const paid = Number(b.amount_paid);
  const price = Number(b.service_price);

  const confirmService = async () => {
    setConfirming(true);
    try {
      await bookingService.confirmService(b.id);
      await onChanged();
    } catch (err) {
      onError(errorMessage(err, "That couldn't be confirmed. Try again."));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <motion.li layout="position" className="job card" exit={{ opacity: 0 }}>
      <div className="job-stub">
        <small>{weekday(b.slot_date)}</small>
        <b className="num">{dayNum(b.slot_date)}</b>
        <small>{monthShort(b.slot_date)}</small>
      </div>
      <div className="job-body">
        <div className="job-top">
          <div>
            <h3><Link to={`/garages/${b.garage_id}`}>{b.garage_name}</Link></h3>
            <p>{b.service_name}, {priceText(b.service_price, b.price_type)}</p>
            <p className="muted small num">{hhmm(b.start_time)} to {hhmm(b.end_time)}, {vehicleLabel(b.vehicle_type)}{b.vehicle_details ? `, ${b.vehicle_details}` : ''}</p>
            {b.notes && <p className="job-notes">{b.notes}</p>}
          </div>
          <div className="job-badges">
            <StatusBadge status={b.status} />
            {paid > 0 && <span className="badge badge-paid">{paid >= price ? 'Paid' : `${money(paid)} paid`}</span>}
            {b.status === 'completed' && !b.has_review && <span className="badge badge-review">Review needed</span>}
          </div>
        </div>

        {b.status === 'confirmed' && <ServiceTracker stage={b.job_stage} />}

        <div className="job-actions">
          {b.status === 'confirmed' && !started && (
            <>
              <button className="btn btn-outline btn-sm" aria-expanded={open === 'reschedule'} onClick={() => toggle('reschedule')}><CalendarClock size={16} aria-hidden="true" />{open === 'reschedule' ? 'Keep this time' : 'Reschedule'}</button>
              <button className="btn btn-danger btn-sm" onClick={() => onCancel(b)}><X size={16} aria-hidden="true" />Cancel booking</button>
            </>
          )}
          {(b.status === 'confirmed' || (b.status === 'completed' && paid > 0)) && b.price_type !== 'inspection' && paid < price && (
            <button className="btn btn-outline btn-sm" onClick={() => onPay(b)}><CreditCard size={16} aria-hidden="true" />{paid > 0 ? 'Pay the balance' : 'Pay now'}</button>
          )}
          {canSelfConfirm(b) && (
            <button className="btn btn-outline btn-sm" disabled={confirming} onClick={confirmService}>
              {confirming ? <Spinner size={16} /> : null}The service was done
            </button>
          )}
          {b.status === 'completed' && !b.has_review && (
            <button className="btn btn-primary btn-sm" aria-expanded={open === 'review'} onClick={() => toggle('review')}><Star size={16} aria-hidden="true" />{open === 'review' ? 'Close' : 'Write your review'}</button>
          )}
          {Boolean(b.has_review) && <span className="muted small">You reviewed this booking</span>}
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }} style={{ overflow: 'hidden' }}>
              {open === 'reschedule' && <RescheduleForm booking={b} onDone={() => { setOpen(null); onChanged(); }} />}
              {open === 'review' && <ReviewForm bookingId={b.id} onSubmitted={() => { setOpen(null); onChanged(); }} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useUrlTab(['upcoming', 'past'], 'upcoming');
  const [cancelling, setCancelling] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [paying, setPaying] = useState(null);
  const [params, setParams] = useSearchParams();
  const returned = params.get('payment');
  const { pending, required, refresh: refreshGate } = useReviewGate();
  // Bookings whose review prompt the customer has chosen to postpone this visit.
  const [postponed, setPostponed] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await bookingService.my();
      setBookings(res.data.bookings);
    } catch (err) {
      setError(errorMessage(err, "Your bookings couldn't be loaded. Refresh to try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A review is required before the next booking, so it is offered the moment a
  // completed job shows up here, not buried under the Past tab.
  const promptFor = required ? pending.find((p) => !postponed.includes(p.booking_id)) : null;
  const afterReview = async () => { await Promise.all([load(), refreshGate()]); };

  // Keeps the tracker current while someone waits for their vehicle.
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const handleCancel = async () => {
    setCancelBusy(true);
    setError('');
    try {
      await bookingService.cancel(cancelling.id);
      await load();
    } catch (err) {
      setError(errorMessage(err, "The booking couldn't be cancelled. Try again."));
    } finally {
      setCancelBusy(false);
      setCancelling(null);
    }
  };

  const upcoming = bookings.filter((b) => b.status === 'confirmed')
    .sort((a, b) => `${a.slot_date}${a.start_time}`.localeCompare(`${b.slot_date}${b.start_time}`));
  const past = bookings.filter((b) => b.status !== 'confirmed');
  const visible = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="container page">
      <div className="page-head"><h1>My bookings</h1></div>

      {returned === 'return' && <Alert kind="success">Payment submitted. It shows here once the gateway confirms it.</Alert>}
      {returned === 'cancelled' && <Alert kind="info">The payment was cancelled, so nothing was charged.</Alert>}
      {returned && <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => setParams((c) => { const n = new URLSearchParams(c); n.delete('payment'); return n; })}>Dismiss</button>}
      {error && <Alert>{error}</Alert>}

      {required && pending.length > 0 && (
        <div className="gate-banner" role="status">
          <Star size={22} aria-hidden="true" />
          <div>
            <b>{pending.length === 1 ? 'One completed service needs your review' : `${pending.length} completed services need your review`}</b>
            <span>Reviews are required before you can book again. They keep ratings honest for the next driver.</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setPostponed([])}>Review now</button>
        </div>
      )}

      <Tabs label="Bookings" value={tab} onChange={setTab} tabs={[
        { key: 'upcoming', label: `Upcoming (${upcoming.length})` },
        { key: 'past', label: `Past (${past.length})` }
      ]} />

      {loading ? (
        <div>{[0, 1].map((i) => <Skeleton key={i} height={150} style={{ marginBottom: 12 }} />)}</div>
      ) : visible.length === 0 ? (
        <Empty icon={CalendarClock} title={tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings'}>
          {tab === 'upcoming' && <><p>Compare garages and reserve a time.</p><Link to="/" className="btn btn-primary">Find a garage</Link></>}
        </Empty>
      ) : (
        <ul className="job-list">
          <AnimatePresence initial={false}>
            {visible.map((b) => <BookingCard key={b.id} booking={b} onChanged={afterReview} onError={setError} onCancel={setCancelling} onPay={setPaying} />)}
          </AnimatePresence>
        </ul>
      )}

      <Modal open={Boolean(promptFor)} onClose={() => promptFor && setPostponed((p) => [...p, promptFor.booking_id])} title="How was your service?">
        {promptFor && (
          <>
            <p><b>{promptFor.service_name}</b> at <b>{promptFor.garage_name}</b> is complete. Rate it to unlock your next booking.</p>
            <ReviewForm key={promptFor.booking_id} plain bookingId={promptFor.booking_id} onSubmitted={afterReview} />
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setPostponed((p) => [...p, promptFor.booking_id])}>Not now</button>
          </>
        )}
      </Modal>

      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="Cancel this booking?">
        {cancelling && (
          <>
            <p>{cancelling.service_name} at {cancelling.garage_name} will be cancelled and the time released to other customers.</p>
            {Number(cancelling.amount_paid) > 0 && <Alert kind="info">The {money(cancelling.amount_paid)} payment on this booking will be marked for refund.</Alert>}
            <div className="row">
              <button className="btn btn-danger" disabled={cancelBusy} onClick={handleCancel}>{cancelBusy ? 'Cancelling' : 'Cancel booking'}</button>
              <button className="btn btn-outline" onClick={() => setCancelling(null)}>Keep booking</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={Boolean(paying)} onClose={() => setPaying(null)} title={paying ? `Pay for ${paying.service_name}` : ''}>
        {paying && <PayDialog booking={paying} onClose={() => setPaying(null)} onPaid={load} />}
      </Modal>
    </div>
  );
}
