import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { whenLabel } from '../lib/format';

const CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:&.-';
const NAME_CELLS = 20;
const TIME_CELLS = 9;

// One split-flap character. It riffles through a few letters and lands on the
// target, each cell starting slightly later than the one before it.
function FlapCell({ char, delay }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? char : ' ');
  const [tick, setTick] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    if (reduce) { setShown(char); return undefined; }
    let steps = 3 + Math.floor(Math.random() * 4);
    const flip = () => {
      steps -= 1;
      setShown(steps <= 0 ? char : CHARSET[Math.floor(Math.random() * CHARSET.length)]);
      setTick((t) => t + 1);
      if (steps > 0) timer.current = setTimeout(flip, 70);
    };
    timer.current = setTimeout(flip, delay);
    return () => clearTimeout(timer.current);
  }, [char, delay, reduce]);

  return (
    <span className="flap" aria-hidden="true">
      <span key={tick} className={tick && !reduce ? 'flap-face flap-turn' : 'flap-face'}>{shown}</span>
    </span>
  );
}

function FlapText({ text, cells, baseDelay }) {
  const padded = text.toUpperCase().slice(0, cells).padEnd(cells, ' ');
  return (
    <span className="flap-text">
      {padded.split('').map((c, i) => <FlapCell key={i} char={c} delay={baseDelay + i * 22} />)}
    </span>
  );
}

// Trims at a word where possible, so a long name doesn't end mid-word.
function fitName(name) {
  if (name.length <= NAME_CELLS) return name;
  const cut = name.slice(0, NAME_CELLS);
  return cut.slice(0, cut.lastIndexOf(' ')) || cut;
}

// The live board of the next open bay at each garage. All data is real, from
// the same slots table that bookings are made against.
export default function FlapBoard({ rows, loading }) {
  return (
    <section className="board" aria-label="Next open bays">
      <header className="board-head">
        <h2>Next open bays</h2>
        <span className="live"><span className="live-dot" aria-hidden="true" />Live</span>
      </header>
      {loading && !rows.length ? (
        <div className="board-rows">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="board-row board-row-idle"><FlapText text="" cells={NAME_CELLS} baseDelay={0} /></div>)}
        </div>
      ) : rows.length === 0 ? (
        <p className="board-empty">No open bays are listed right now.</p>
      ) : (
        <ul className="board-rows">
          {rows.slice(0, 5).map((row, i) => {
            const { day, time } = whenLabel(row.next_free_at);
            const shortDay = day === 'Tomorrow' ? 'TMR' : day.slice(0, 3);
            return (
              <li key={row.garage_id}>
                <Link to={`/garages/${row.garage_id}`} className="board-row" aria-label={`${row.garage_name}, ${row.city}. Next open bay ${day} at ${time}.`}>
                  <FlapText text={fitName(row.garage_name)} cells={NAME_CELLS} baseDelay={i * 120} />
                  <FlapText text={`${shortDay} ${time}`} cells={TIME_CELLS} baseDelay={i * 120 + 240} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
