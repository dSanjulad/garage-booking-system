import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { hhmm, longDate, priceText, vehicleLabel } from '../lib/format';

// The booking confirmation, styled as a workshop job card. It feeds out of a
// slot and the stamp lands once: a clear signal that the bay is actually held.
export default function JobTicket({ booking, onPay }) {
  return (
    <div className="ticket-slot">
      <motion.div className="ticket" initial={{ y: -40, opacity: 0, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, opacity: 1, clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }}>
        <div className="ticket-head">
          <span>Job card</span>
          <span className="num">No. {String(booking.id).padStart(5, '0')}</span>
        </div>
        <motion.div className="stamp" aria-hidden="true" initial={{ scale: 2.4, opacity: 0, rotate: -24 }} animate={{ scale: 1, opacity: 1, rotate: -9 }} transition={{ delay: 0.55, type: 'spring', stiffness: 520, damping: 22 }}>
          Booked
        </motion.div>
        <dl>
          <div><dt>Garage</dt><dd>{booking.garage_name}<small>{booking.garage_address}, {booking.garage_city}</small></dd></div>
          <div><dt>Service</dt><dd>{booking.service_name}<small>{priceText(booking.service_price, booking.price_type)}</small></dd></div>
          <div><dt>When</dt><dd>{longDate(booking.slot_date)}<small className="num">{hhmm(booking.start_time)} to {hhmm(booking.end_time)}</small></dd></div>
          <div><dt>Vehicle</dt><dd>{vehicleLabel(booking.vehicle_type)}{booking.vehicle_details && <small>{booking.vehicle_details}</small>}</dd></div>
        </dl>
      </motion.div>
      <p className="muted small ticket-note">We've sent the details to {booking.customer_email}, and we'll remind you the day before.</p>
      <div className="row ticket-actions">
        {booking.price_type !== 'inspection' && <button className="btn btn-primary" onClick={onPay}>Pay now</button>}
        <Link to="/my-bookings" className="btn btn-outline">View my bookings</Link>
      </div>
    </div>
  );
}
