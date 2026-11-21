import React from 'react';
import { CalendarCheck2, Check, ClipboardCheck, PackageCheck, Wrench } from 'lucide-react';

const STEPS = [
  { key: 'scheduled', label: 'Booked', icon: CalendarCheck2 },
  { key: 'received', label: 'At the garage', icon: ClipboardCheck },
  { key: 'in_service', label: 'Being serviced', icon: Wrench },
  { key: 'ready', label: 'Ready to collect', icon: PackageCheck }
];

// Shows where the vehicle is. The line fills up to the current stage, and the
// current stage gently pulses so it's obvious what is happening now.
export default function ServiceTracker({ stage }) {
  const finished = stage === 'finished';
  const current = finished ? STEPS.length - 1 : Math.max(0, STEPS.findIndex((s) => s.key === stage));
  const percent = (current / (STEPS.length - 1)) * 100;

  return (
    <ol className="tracker" aria-label={`Service progress: ${finished ? 'finished' : STEPS[current].label}`}>
      <span className="tracker-line" aria-hidden="true">
        <i className="grow-x" style={{ width: `${percent}%` }} />
      </span>
      {STEPS.map((step, i) => {
        const done = i < current || finished;
        const now = i === current && !finished;
        const Icon = done ? Check : step.icon;
        return (
          <li key={step.key} className={`${done ? 'is-done' : ''} ${now ? 'is-now' : ''}`} aria-current={now ? 'step' : undefined}>
            <span className="tracker-dot"><Icon size={16} aria-hidden="true" /></span>
            <span className="tracker-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
