import React from 'react';
import { motion } from 'framer-motion';

// A car drawn as a workshop blueprint. It draws itself once when the page opens.
const PATHS = [
  'M40 158 L58 158 C60 134 82 122 102 128 C114 132 122 144 124 158 L276 158 C278 134 300 122 320 128 C332 132 340 144 342 158 L372 158 C380 158 384 152 382 144 L376 120 C374 110 366 104 356 102 L306 92 L262 54 C254 48 246 44 236 44 L136 44 C124 44 114 50 106 58 L72 92 L46 100 C36 104 30 112 30 122 L30 148 C30 154 34 158 40 158 Z',
  'M116 92 L136 62 C138 58 142 56 146 56 L186 56 L186 92 Z',
  'M198 56 L236 56 C242 56 248 58 252 62 L286 92 L198 92 Z',
  'M192 56 L192 150',
  'M300 112 L330 112', 'M60 112 L84 112'
];

function Blueprint() {
  return (
    <svg viewBox="0 0 410 200" className="blueprint" aria-hidden="true">
      {PATHS.map((d, i) => (
        <motion.path key={d} d={d} fill="none" stroke="var(--plate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.3, delay: i * 0.12, ease: 'easeInOut' }} />
      ))}
      {[91, 309].map((cx, i) => (
        <motion.g key={cx} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 1.1 + i * 0.1 }} style={{ transformOrigin: `${cx}px 160px` }}>
          <circle cx={cx} cy="160" r="26" fill="none" stroke="var(--plate)" strokeWidth="2" />
          <circle cx={cx} cy="160" r="10" fill="none" stroke="var(--plate)" strokeWidth="2" />
        </motion.g>
      ))}
      <motion.path d="M30 192 L382 192" stroke="#5a6d90" strokeWidth="1.5" strokeDasharray="4 6"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} />
    </svg>
  );
}

export default function AuthLayout({ title, intro, children }) {
  return (
    <div className="auth">
      <aside className="auth-aside">
        <Blueprint />
        <h2>{title}</h2>
        <p>{intro}</p>
      </aside>
      <div className="auth-main">{children}</div>
    </div>
  );
}
