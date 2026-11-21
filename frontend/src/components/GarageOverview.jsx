import React, { useEffect, useState } from 'react';
import { garageService, errorMessage } from '../services/api';
import { Alert, AnimatedNumber, BarChart, Skeleton } from './ui';
import { dayNum, monthShort } from '../lib/format';

function Stat({ value, decimals, suffix, prefix, label, note, none }) {
  return (
    <div className="stat">
      <b>{value === null || value === undefined ? (none || 'None yet') : <AnimatedNumber value={value} decimals={decimals} suffix={suffix} prefix={prefix} />}</b>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </div>
  );
}

// The figures a paper diary can't give a garage.
export default function GarageOverview({ garageId }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setStats(null);
    garageService.stats(garageId)
      .then((r) => setStats(r.data.stats))
      .catch((err) => setError(errorMessage(err, "These figures couldn't be loaded.")));
  }, [garageId]);

  if (error) return <Alert>{error}</Alert>;
  if (!stats) return <Skeleton height={320} />;

  const topMax = Math.max(1, ...stats.top_services.map((s) => s.bookings));
  return (
    <div>
      <h2>Overview</h2>
      <div className="stats">
        <Stat value={stats.bookings_today} label="Bookings today" />
        <Stat value={stats.upcoming} label="Confirmed and open" />
        <Stat value={stats.occupancy_7d} suffix="%" label="Bays booked, next 7 days" none="No slots open" />
        <Stat value={stats.no_show_rate} decimals={1} suffix="%" label="No-show rate" note={`${stats.no_shows} of ${stats.completed + stats.no_shows} appointments`} />
        <Stat value={stats.review_count ? stats.avg_rating : null} decimals={1} label="Average rating" note={`${stats.review_count} verified reviews`} />
        <Stat value={stats.completed_value} prefix="Rs. " label="Completed work" note="At listed prices" />
      </div>

      <div className="overview-grid">
        <section>
          <h3>Bookings, last 14 days</h3>
          <BarChart data={stats.daily.map((d) => ({ label: `${dayNum(d.day)} ${monthShort(d.day)}`, value: d.bookings }))} />
        </section>
        <section>
          <h3>Most booked services</h3>
          {stats.top_services.length === 0 ? <p className="muted">No bookings yet.</p> : (
            <ul className="top-services">
              {stats.top_services.map((s) => (
                <li key={s.name}>
                  <div><span>{s.name}</span><b className="num">{s.bookings}</b></div>
                  <span className="top-bar"><i className="grow-x" style={{ width: `${(s.bookings / topMax) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
