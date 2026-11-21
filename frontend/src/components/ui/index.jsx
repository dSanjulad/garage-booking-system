import React, { useEffect, useId, useRef, useState } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { Star, CircleAlert, CheckCircle2, Info, LoaderCircle } from 'lucide-react';

export function StarRating({ rating = 0, count, size = 16 }) {
  return (
    <span className="stars" role="img" aria-label={rating > 0 ? `Rated ${rating.toFixed(1)} out of 5` : 'No ratings yet'}>
      <span className="stars-row" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => {
          // Each star fills in proportion, so 4.3 and 4.5 look different.
          const fill = Math.max(0, Math.min(1, rating - (i - 1)));
          return (
            <span key={i} className="star" style={{ width: size, height: size }}>
              <Star size={size} strokeWidth={1.6} color="#c3cbd8" />
              <span className="star-fill" style={{ width: `${fill * 100}%` }}>
                <Star size={size} strokeWidth={1.6} fill="currentColor" />
              </span>
            </span>
          );
        })}
      </span>
      <span className="stars-text">
        {rating > 0 ? rating.toFixed(1) : 'No ratings yet'}
        {count > 0 && ` (${count})`}
      </span>
    </span>
  );
}

const BADGE_LABELS = {
  confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show',
  paid: 'Paid', pending: 'Awaiting payment', failed: 'Failed', refunded: 'Refunded', refund_due: 'Refund due'
};
export const StatusBadge = ({ status }) => <span className={`badge badge-${status}`}>{BADGE_LABELS[status] || status}</span>;

export function Alert({ kind = 'error', children }) {
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'info' ? Info : CircleAlert;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export const Spinner = ({ size = 18 }) => <LoaderCircle size={size} className="spin" aria-hidden="true" />;

export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, ...style }} aria-hidden="true" />;
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={36} aria-hidden="true" />}
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

// Counts up once when it scrolls into view. Honours reduced motion by showing
// the final value straight away.
export function AnimatedNumber({ value, decimals = 0, suffix = '', prefix = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) { setShown(value); return undefined; }
    if (!inView) return undefined;
    const controls = animate(0, value, { duration: 0.9, ease: [0.2, 0.7, 0.2, 1], onUpdate: setShown });
    return () => controls.stop();
  }, [inView, value, reduce]);

  return <span ref={ref} className="num">{prefix}{Number(shown).toLocaleString('en-LK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

// Tabs with one yellow bar that slides between them (shared layout animation).
export function Tabs({ tabs, value, onChange, label }) {
  const id = useId();
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} role="tab" type="button" className="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}>
          {t.label}
          {value === t.key && <motion.span layoutId={`tab-bar-${id}`} className="tab-bar" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
        </button>
      ))}
    </div>
  );
}

// Modal with focus trap-lite: Escape closes, focus moves in, and returns on close.
export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
            className={`modal card ${wide ? 'modal-wide' : ''}`}
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
            <h2>{title}</h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </>
  );
}

// Bars for one series over time. Marks are thin with a rounded data end sitting
// on the baseline; hovering or focusing a bar shows its exact value.
export function BarChart({ data, unit = 'bookings', height = 150 }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 560;
  const H = height;
  const gap = 8;
  const bw = (W - gap * (data.length - 1)) / data.length;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <figure className="chart" aria-label={`${total} ${unit} over the last ${data.length} days`}>
      <div className="chart-tip" aria-hidden="true">
        {active !== null ? <><b>{data[active].value}</b> {unit}, {data[active].label}</> : <span>Hover a bar for its value</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="presentation" onMouseLeave={() => setActive(null)}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--line)" strokeWidth="2" />
        {data.map((d, i) => {
          const h = Math.max(d.value ? 4 : 0, (d.value / max) * (H - 12));
          const x = i * (bw + gap);
          return (
            <g key={d.label} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} tabIndex={0} aria-label={`${d.label}: ${d.value} ${unit}`}>
              <rect x={x - gap / 2} y="0" width={bw + gap} height={H} fill="transparent" />
              <motion.rect x={x} width={bw} rx="4" fill={active === i ? 'var(--ink)' : 'var(--ink-3)'}
                initial={reduce ? false : { height: 0, y: H }} animate={{ height: h, y: H - h }}
                transition={{ duration: 0.6, delay: reduce ? 0 : i * 0.025, ease: [0.2, 0.7, 0.2, 1] }} />
              {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
                <text x={x + bw / 2} y={H + 17} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fontSize="12" fill="var(--muted)">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="sr-only"><table><caption>{unit} per day</caption><tbody>{data.map((d) => <tr key={d.label}><th>{d.label}</th><td>{d.value}</td></tr>)}</tbody></table></div>
    </figure>
  );
}
