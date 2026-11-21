import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck, MapPin } from 'lucide-react';
import { StarRating } from './ui';
import { money, whenLabel } from '../lib/format';

// A comparison row rather than a card: the job of this list is to compare the
// same three facts across garages, so they line up in columns.
const GarageRow = React.forwardRef(function GarageRow({ garage }, ref) {
  const next = garage.next_free_at ? whenLabel(garage.next_free_at) : null;
  const trackSpotlight = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <motion.li ref={ref} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
      <Link to={`/garages/${garage.id}`} className="garage-row" onPointerMove={trackSpotlight}>
        <div className="garage-row-main">
          <h3>
            {garage.name}
            {Boolean(garage.is_verified) && <BadgeCheck size={18} className="verified-mark" aria-label="Verified by GarageBookLK" />}
          </h3>
          <p><MapPin size={14} aria-hidden="true" />{garage.address}, {garage.city}</p>
        </div>
        <div className="garage-row-cell">
          <StarRating rating={Number(garage.avg_rating)} count={Number(garage.review_count)} />
        </div>
        <div className="garage-row-cell">
          {next ? <span className="next-free"><b>{next.day}</b> {next.time}</span> : <span className="muted small">No open slots</span>}
        </div>
        <div className="garage-row-cell garage-row-price">
          {garage.min_price !== null ? <><span className="muted small">from</span> <b className="num">{money(garage.min_price)}</b></> : <span className="muted small">No prices listed</span>}
        </div>
      </Link>
    </motion.li>
  );
});

export default GarageRow;
