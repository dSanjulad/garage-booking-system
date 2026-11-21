import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { dayNum, hhmm, monthShort, weekday } from '../lib/format';
import { todayISO } from '../utils/date';
import { Skeleton } from './ui';

// Fourteen days at a glance. A thin bar under each date shows how much room is
// left, and days with nothing free are visibly closed, before anyone taps them.
export function DateStrip({ days, value, onChange }) {
  const today = todayISO();
  return (
    <div className="date-strip" role="radiogroup" aria-label="Date">
      {days.map((d) => {
        const closed = d.total_bays === 0;
        const full = !closed && d.free_bays === 0;
        const share = d.total_bays ? d.free_bays / d.total_bays : 0;
        const selected = value === d.date;
        const status = closed ? 'closed' : full ? 'fully booked' : `${d.free_bays} bay periods free`;
        return (
          <button key={d.date} type="button" role="radio" aria-checked={selected} disabled={closed || full}
            aria-label={`${weekday(d.date, 'long')} ${dayNum(d.date)} ${monthShort(d.date)}, ${status}`}
            className={`date-chip ${selected ? 'is-on' : ''}`} onClick={() => onChange(d.date)}>
            {selected && <motion.span layoutId="date-on" className="date-highlight" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
            <span className="date-inner">
              <small>{d.date === today ? 'Today' : weekday(d.date)}</small>
              <b>{dayNum(d.date)}</b>
              <span className="date-meter" aria-hidden="true"><i style={{ width: `${Math.round(share * 100)}%` }} /></span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Times for one day. A service longer than one slot needs several in a row, so
// hovering or choosing a start time lights up every slot the job will occupy.
export function SlotGrid({ slots, needed = 1, loading, selectedId, onSelect, currentId, disabled, emptyText }) {
  const [hoverId, setHoverId] = useState(null);
  const previous = useRef(new Map());

  // Remember the last known free count so a slot that just changed can pulse.
  useEffect(() => {
    const t = setTimeout(() => { previous.current = new Map(slots.map((s) => [s.id, s.available_count])); }, 900);
    return () => clearTimeout(t);
  }, [slots]);

  if (loading && !slots.length) {
    return <div className="slot-grid">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} height={50} />)}</div>;
  }
  if (!slots.length) return <p className="slot-empty">{emptyText || 'No times are open on this day. Try another date.'}</p>;

  const anchorId = hoverId || selectedId;
  const anchorIndex = slots.findIndex((s) => s.id === anchorId);
  const inRun = (i) => anchorIndex >= 0 && i >= anchorIndex && i < anchorIndex + needed;

  return (
    <div className="slot-grid" onMouseLeave={() => setHoverId(null)}>
      {slots.map((s, i) => {
        const selectable = s.fits !== false && !s.started && s.id !== currentId;
        const selected = selectedId === s.id;
        const changed = previous.current.has(s.id) && previous.current.get(s.id) !== s.available_count;
        const status = s.id === currentId ? 'Your current time'
          : s.started ? 'Time has passed'
          : s.available_count <= 0 ? 'Fully booked'
          : s.fits === false ? 'Not enough time for this service'
          : `${s.available_count} of ${s.capacity} bays free`;
        return (
          <motion.button key={s.id} type="button" title={status} aria-label={`${hhmm(s.start_time)}, ${status}`} aria-pressed={selected}
            whileTap={selectable ? { scale: 0.95 } : undefined}
            disabled={!selectable || disabled}
            onMouseEnter={() => selectable && setHoverId(s.id)}
            onClick={() => onSelect(s.id)}
            className={[
              'slot',
              selected ? 'is-on' : '',
              inRun(i) && !selected && (selectable || selectedId) ? 'is-run' : '',
              s.id === currentId ? 'is-current' : '',
              changed ? 'is-changed' : ''
            ].join(' ')}>
            <b className="num">{hhmm(s.start_time)}</b>
            <span className="bays" aria-hidden="true">
              {Array.from({ length: Math.min(s.capacity, 6) }, (_, n) => <i key={n} className={n < s.available_count ? 'free' : ''} />)}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
