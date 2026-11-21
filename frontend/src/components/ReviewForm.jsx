import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { bookingService, errorMessage } from '../services/api';
import { Alert } from './ui';

export function StarInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-input" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
          whileTap={{ scale: 0.8 }} animate={{ scale: value === n ? [1, 1.3, 1] : 1 }}
          onMouseEnter={() => setHover(n)} onClick={() => onChange(n)}>
          <Star size={30} strokeWidth={1.6} fill={(hover || value) >= n ? 'var(--plate)' : 'none'} color={(hover || value) >= n ? 'var(--plate-deep)' : '#b7c0ce'} />
        </motion.button>
      ))}
    </div>
  );
}

// A star rating is required; the comment is optional.
export default function ReviewForm({ bookingId, onSubmitted, plain = false }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) { setError('Choose a star rating first.'); return; }
    setError('');
    setSubmitting(true);
    try {
      await bookingService.review(bookingId, { rating, comment });
      onSubmitted();
    } catch (err) {
      setError(errorMessage(err, "The review couldn't be saved. Try again."));
      setSubmitting(false);
    }
  };

  return (
    <form className={plain ? 'review-form' : 'inline-panel'} onSubmit={submit}>
      {error && <Alert>{error}</Alert>}
      <span className="label">How did it go?</span>
      <StarInput value={rating} onChange={setRating} />
      <div className="field">
        <label htmlFor={`comment-${bookingId}`} className="sr-only">Your comment</label>
        <textarea id={`comment-${bookingId}`} maxLength={2000} rows={3} placeholder="Tell other owners what to expect (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-dark btn-sm" disabled={submitting}>{submitting ? 'Publishing' : 'Publish review'}</button>
    </form>
  );
}
