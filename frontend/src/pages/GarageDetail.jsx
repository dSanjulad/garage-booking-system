import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck, CalendarX, Clock, MapPin, Navigation, Phone, Quote, Timer, Wrench } from 'lucide-react';
import { garageService, serviceService, slotService, bookingService, reviewService, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useReviewGate } from '../context/ReviewGate';
import { Alert, Empty, Modal, Skeleton, Spinner, StarRating } from '../components/ui';
import VehiclePicker from '../components/VehiclePicker';
import { DateStrip, SlotGrid } from '../components/SlotPicker';
import JobTicket from '../components/JobTicket';
import PayDialog from '../components/PayDialog';
import { PRICE_TYPES, WEEKDAYS, hhmm, longDate, priceText } from '../lib/format';

const LIVE_MS = 15000;

function ReviewSummary({ reviews, average }) {
  const counts = [5, 4, 3, 2, 1].map((star) => ({ star, n: reviews.filter((r) => r.rating === star).length }));
  const top = Math.max(1, ...counts.map((c) => c.n));
  return (
    <div className="review-summary">
      <div className="review-score">
        <b className="num">{average.toFixed(1)}</b>
        <StarRating rating={average} />
        <span className="muted small">{reviews.length} verified {reviews.length === 1 ? 'review' : 'reviews'}</span>
      </div>
      <ul className="review-bars" aria-label="Number of reviews at each star rating">
        {counts.map(({ star, n }) => (
          <li key={star}>
            <span className="num">{star}</span>
            <span className="bar"><i className="grow-x" style={{ width: `${(n / top) * 100}%` }} /></span>
            <span className="num muted">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GarageDetail() {
  const { id } = useParams();
  const { isAuthenticated, isOwner } = useAuth();
  const navigate = useNavigate();
  const { pending, required, refresh: refreshGate } = useReviewGate();
  const mustReview = isAuthenticated && isOwner && required && pending.length > 0;

  const [garage, setGarage] = useState(null);
  const [services, setServices] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [vehicleType, setVehicleType] = useState('car');
  const [serviceId, setServiceId] = useState(null);
  const [days, setDays] = useState([]);
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [needed, setNeeded] = useState(1);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotId, setSlotId] = useState(null);
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [slotLost, setSlotLost] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [paying, setPaying] = useState(false);
  const selectedRef = useRef(null);
  selectedRef.current = slotId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [g, s, r] = await Promise.all([garageService.getById(id), serviceService.listForGarage(id), reviewService.listForGarage(id)]);
        if (cancelled) return;
        setGarage(g.data.garage);
        setServices(s.data.services);
        setReviews(r.data.reviews);
        const firstTypes = s.data.services[0]?.vehicle_types.split(',') || [];
        if (firstTypes.length && !firstTypes.includes('car')) setVehicleType(firstTypes[0]);
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, "This garage couldn't be loaded."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const availableVehicles = useMemo(() => [...new Set(services.flatMap((s) => s.vehicle_types.split(',')))], [services]);
  const matching = useMemo(() => services.filter((s) => s.vehicle_types.split(',').includes(vehicleType)), [services, vehicleType]);

  // Keep the chosen service valid when the vehicle changes.
  useEffect(() => {
    if (!matching.some((s) => s.id === serviceId)) setServiceId(matching[0]?.id ?? null);
  }, [matching, serviceId]);

  const service = services.find((s) => s.id === serviceId);

  const loadDays = useCallback(async () => {
    const { data } = await slotService.availability(id, 14);
    setDays(data.days);
    setDate((current) => current || data.days.find((d) => d.free_bays > 0)?.date || data.days[0]?.date || null);
  }, [id]);

  const loadSlots = useCallback(async ({ quiet = false } = {}) => {
    if (!date) return;
    if (!quiet) setSlotsLoading(true);
    try {
      const { data } = await slotService.listForGarageAndDate(id, date, serviceId || undefined);
      setSlots(data.slots);
      setNeeded(data.slots_needed);
      // Someone else just took the chosen time: say so rather than failing later.
      const chosen = data.slots.find((s) => s.id === selectedRef.current);
      if (selectedRef.current && (!chosen || !chosen.fits)) {
        setSlotId(null);
        setSlotLost(true);
      }
    } catch {
      if (!quiet) setSlots([]);
    } finally {
      if (!quiet) setSlotsLoading(false);
    }
  }, [id, date, serviceId]);

  useEffect(() => { loadDays().catch(() => {}); }, [loadDays]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  // Availability stays current while the page is open.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden || confirmed) return;
      loadSlots({ quiet: true });
      loadDays().catch(() => {});
    }, LIVE_MS);
    return () => clearInterval(timer);
  }, [loadSlots, loadDays, confirmed]);

  const chooseDate = (d) => { setDate(d); setSlotId(null); setSlotLost(false); };
  const chooseService = (sid) => { setServiceId(sid); setSlotId(null); setSlotLost(false); };

  const handleBook = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/garages/${id}` } });
      return;
    }
    setBookingError('');
    setSubmitting(true);
    try {
      const { data } = await bookingService.create({ slotId, serviceId, vehicleType, vehicleDetails, notes });
      setConfirmed(data.booking);
      setNotes('');
      setVehicleDetails('');
      setSlotId(null);
    } catch (err) {
      setBookingError(errorMessage(err, "The booking didn't go through. Please choose another time."));
      if (err.response?.data?.code === 'REVIEW_REQUIRED') refreshGate();
      setSlotId(null);
    } finally {
      setSubmitting(false);
      loadSlots({ quiet: true });
      loadDays().catch(() => {});
    }
  };

  if (loading) {
    return <div className="container page"><Skeleton height={44} width="55%" style={{ marginBottom: 14 }} /><Skeleton height={20} width="35%" style={{ marginBottom: 32 }} /><Skeleton height={320} /></div>;
  }
  if (loadError) return <div className="container page"><Alert>{loadError}</Alert></div>;

  const closedDays = (garage.closed_weekdays || '').split(',').filter(Boolean).map(Number);
  const closedText = WEEKDAYS.filter(([n]) => closedDays.includes(n)).map(([, l]) => l).join(', ');
  const selected = slots.find((s) => s.id === slotId);
  const lastInRun = selected ? slots[slots.findIndex((s) => s.id === slotId) + needed - 1] : null;

  return (
    <div className="garage">
      <header className="garage-hero">
        <div className="container">
          <h1>{garage.name}</h1>
          <div className="garage-hero-meta">
            <StarRating rating={Number(garage.avg_rating)} count={Number(garage.review_count)} />
            {Boolean(garage.is_verified) && <span className="badge badge-verified"><BadgeCheck size={15} aria-hidden="true" />Verified garage</span>}
          </div>
          <ul className="garage-facts">
            <li><MapPin size={16} aria-hidden="true" />{garage.address}, {garage.city}</li>
            <li><Clock size={16} aria-hidden="true" />{hhmm(garage.opening_time)} to {hhmm(garage.closing_time)}{closedText && `, closed ${closedText}`}</li>
            <li><Wrench size={16} aria-hidden="true" />{garage.bay_capacity} {garage.bay_capacity === 1 ? 'bay' : 'bays'}</li>
            {garage.phone && <li><Phone size={16} aria-hidden="true" /><a href={`tel:${garage.phone}`}>{garage.phone}</a></li>}
            {garage.latitude && (
              <li><Navigation size={16} aria-hidden="true" /><a href={`https://www.google.com/maps/search/?api=1&query=${garage.latitude},${garage.longitude}`} target="_blank" rel="noreferrer">Get directions</a></li>
            )}
          </ul>
        </div>
      </header>

      <div className="container garage-grid">
        <div className="garage-content">
          {garage.description && <p className="garage-desc">{garage.description}</p>}

          <section className="garage-services">
            <h2>Services and prices</h2>
            {services.length === 0 ? (
              <Empty icon={Wrench} title="No services listed yet">This garage hasn't added its services.</Empty>
            ) : (
              <ul className="service-list">
                {services.map((s) => {
                  const covers = s.vehicle_types.split(',').includes(vehicleType);
                  return (
                    <li key={s.id}>
                      <button type="button" disabled={!covers} aria-pressed={serviceId === s.id} className={`service-row ${serviceId === s.id ? 'is-on' : ''}`} onClick={() => chooseService(s.id)}>
                        {serviceId === s.id && <motion.span layoutId="service-on" className="service-mark" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                        <span className="service-text">
                          <b>{s.name}</b>
                          {s.description && <span>{s.description}</span>}
                          {!covers && <em>Not offered for this vehicle</em>}
                        </span>
                        <span className="service-side">
                          <b className="num">{priceText(s.price, s.price_type)}</b>
                          <span className="row-tight"><Timer size={14} aria-hidden="true" />{s.duration_minutes} min</span>
                          {s.price_type === 'inspection' && <span>{PRICE_TYPES.inspection.label}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="garage-reviews">
            <h2>Reviews from completed bookings</h2>
            {reviews.length === 0 ? (
              <p className="muted">No reviews yet. Reviews appear here after customers have completed a booking.</p>
            ) : (
              <>
                <ReviewSummary reviews={reviews} average={Number(garage.avg_rating)} />
                <ul className="review-list">
                  {reviews.slice(0, 8).map((r) => (
                    <li key={r.id}>
                      <div className="review-top">
                        <StarRating rating={r.rating} />
                        <span className="review-who">{r.customer_name}</span>
                      </div>
                      {r.comment && <p><Quote size={14} aria-hidden="true" />{r.comment}</p>}
                      <span className="review-proof"><BadgeCheck size={14} aria-hidden="true" />Completed booking: {r.service_name}, {longDate(r.service_date)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <aside className="book card" aria-label="Book an appointment">
          <div className="book-head">
            <h2>Book a time</h2>
            <span className="live live-dark"><span className="live-dot" aria-hidden="true" />Live</span>
          </div>

          {mustReview && (
            <div className="gate-block" role="status">
              <b>Review your last service first</b>
              <span>Your completed {pending[0].service_name} at {pending[0].garage_name} still needs a rating. It takes under a minute, then you can book here.</span>
              <Link to="/my-bookings?tab=past" className="btn btn-primary btn-sm">Write the review</Link>
            </div>
          )}

          {availableVehicles.length > 1 && (
            <div className="field">
              <span className="label">Your vehicle</span>
              <VehiclePicker value={vehicleType} onChange={setVehicleType} available={availableVehicles} />
            </div>
          )}

          <div className="field">
            <label htmlFor="service">Service</label>
            <select id="service" value={serviceId ?? ''} onChange={(e) => chooseService(Number(e.target.value))}>
              {matching.map((s) => <option key={s.id} value={s.id}>{s.name}, {priceText(s.price, s.price_type)}</option>)}
            </select>
          </div>

          <div className="field">
            <span className="label">Date</span>
            {days.some((d) => d.total_bays > 0) ? (
              <DateStrip days={days} value={date} onChange={chooseDate} />
            ) : (
              <p className="slot-empty"><CalendarX size={18} aria-hidden="true" />This garage has no open dates yet.</p>
            )}
          </div>

          <div className="field">
            <span className="label">Start time</span>
            <AlertLost show={slotLost} />
            <SlotGrid slots={slots} needed={needed} loading={slotsLoading} selectedId={slotId} onSelect={(sid) => { setSlotId(sid); setSlotLost(false); }} />
            {needed > 1 && service && <span className="hint">{service.name} takes {service.duration_minutes} minutes, so it holds {needed} time slots in a row.</span>}
          </div>

          <div className="field">
            <label htmlFor="vehicleDetails">Make and model (optional)</label>
            <input id="vehicleDetails" maxLength={120} placeholder="Toyota Aqua 2016" value={vehicleDetails} onChange={(e) => setVehicleDetails(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes for the garage (optional)</label>
            <textarea id="notes" rows={2} maxLength={500} placeholder="Noise from the front-left wheel" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {bookingError && <Alert>{bookingError}</Alert>}

          {selected && service && (
            <motion.div className="book-summary" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <span><b>{longDate(date)}</b>, {hhmm(selected.start_time)} to {hhmm((lastInRun || selected).end_time)}</span>
              <b className="num">{priceText(service.price, service.price_type)}</b>
            </motion.div>
          )}

          {isAuthenticated && !isOwner ? (
            <Alert kind="info">Only vehicle owner accounts can make bookings.</Alert>
          ) : (
            <button type="button" className="btn btn-primary btn-block" disabled={mustReview || (isAuthenticated && !slotId) || !serviceId || submitting} onClick={handleBook}>
              {submitting ? <><Spinner />Booking</> : !isAuthenticated ? 'Log in to book' : mustReview ? 'Review required to book' : slotId ? 'Confirm booking' : 'Choose a start time'}
            </button>
          )}
          {service?.price_type === 'starting_from' && <p className="hint book-hint">Starting price. The final bill may vary with your vehicle.</p>}
        </aside>
      </div>

      <Modal open={Boolean(confirmed)} onClose={() => { setConfirmed(null); setPaying(false); }} title={paying ? `Pay for ${confirmed?.service_name}` : 'Your bay is booked'}>
        {confirmed && (paying ? (
          <PayDialog booking={confirmed} onClose={() => { setConfirmed(null); setPaying(false); }} />
        ) : (
          <JobTicket booking={confirmed} onPay={() => setPaying(true)} />
        ))}
      </Modal>
    </div>
  );
}

function AlertLost({ show }) {
  if (!show) return null;
  return <Alert kind="warn">Someone else just booked that time. Please choose another.</Alert>;
}

