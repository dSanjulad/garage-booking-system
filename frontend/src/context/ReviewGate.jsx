import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { bookingService } from '../services/api';
import { useAuth } from './AuthContext';

/*
 * Mandatory reviews. The server refuses a new booking while an earlier completed
 * one has no review; this keeps the same list on the client so the nav badge,
 * the garage page and My bookings can all explain why, and link to the fix.
 */
const ReviewGateContext = createContext({ pending: [], required: false, refresh: async () => {} });

export function ReviewGateProvider({ children }) {
  const { isOwner, isAuthenticated } = useAuth();
  const [state, setState] = useState({ pending: [], required: false });

  const refresh = useCallback(async () => {
    if (!isOwner) { setState({ pending: [], required: false }); return; }
    try {
      const { data } = await bookingService.pendingReviews();
      setState({ pending: data.pending, required: data.required });
    } catch { /* keep the last known list; the server still enforces the rule */ }
  }, [isOwner]);

  useEffect(() => {
    refresh();
    if (!isOwner) return undefined;
    // A job can be completed at any moment while the customer is browsing.
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refresh, isOwner, isAuthenticated]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <ReviewGateContext.Provider value={value}>{children}</ReviewGateContext.Provider>;
}

export const useReviewGate = () => useContext(ReviewGateContext);
