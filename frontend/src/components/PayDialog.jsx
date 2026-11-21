import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, CreditCard, PiggyBank, ShieldCheck } from 'lucide-react';
import { paymentService, errorMessage } from '../services/api';
import { Alert, Spinner } from './ui';
import { money } from '../lib/format';

// PayHere's hosted checkout is a form post, so card details never touch this site.
function submitToGateway({ action, fields }) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

// Payment is always optional. The amount shown here is a preview; the server
// works out the real amount from the booking.
export default function PayDialog({ booking, onClose, onPaid }) {
  const price = Number(booking.service_price);
  const paid = Number(booking.amount_paid || 0);
  const outstanding = price - paid;
  const [config, setConfig] = useState({ provider: 'simulated', depositPercent: 20 });
  const [payment, setPayment] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    paymentService.config().then((r) => setConfig(r.data)).catch(() => {});
  }, []);

  const start = async (type) => {
    setBusy(true);
    setError('');
    try {
      const { data } = await paymentService.start(booking.id, type);
      if (data.checkout.mode === 'redirect') {
        submitToGateway(data.checkout);
        return;
      }
      setPayment(data.payment);
    } catch (err) {
      setError(errorMessage(err, "The payment couldn't be started. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const simulate = async (result) => {
    setBusy(true);
    setError('');
    try {
      await paymentService.simulate(payment.id, result);
      if (result === 'success') {
        setOutcome('paid');
        onPaid?.();
      } else {
        setError("The payment wasn't completed, so nothing was charged. You can try again or pay at the garage.");
        setPayment(null);
      }
    } catch (err) {
      setError(errorMessage(err, "The payment couldn't be completed. Try again."));
    } finally {
      setBusy(false);
    }
  };

  if (outcome === 'paid') {
    return (
      <div className="pay-done">
        <motion.span initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}>
          <CheckCircle2 size={56} aria-hidden="true" />
        </motion.span>
        <h3>Payment received</h3>
        <p className="muted">{money(payment.amount)} has been recorded against this booking.</p>
        <button className="btn btn-dark btn-block" onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <div>
      {error && <Alert>{error}</Alert>}

      {payment ? (
        <div className="pay-sim">
          <ShieldCheck size={28} aria-hidden="true" />
          <p>You're about to pay <b className="num">{money(payment.amount)}</b> for this booking. Confirm to complete the payment.</p>
          <div className="row">
            <button className="btn btn-primary" disabled={busy} onClick={() => simulate('success')}>Confirm payment</button>
            <button className="btn btn-outline" disabled={busy} onClick={() => simulate('failure')}>Cancel payment</button>
          </div>
        </div>
      ) : (
        <div className="pay-options">
          <button className="pay-option" disabled={busy} onClick={() => start('full')}>
            <CreditCard size={22} aria-hidden="true" />
            <span><b>{paid > 0 ? 'Pay the balance' : 'Pay in full'}</b><small>{money(outstanding)}</small></span>
          </button>
          {paid === 0 && (
            <button className="pay-option" disabled={busy} onClick={() => start('deposit')}>
              <PiggyBank size={22} aria-hidden="true" />
              <span><b>Pay a {config.depositPercent}% deposit</b><small>{money(Math.round(price * config.depositPercent) / 100)} now, the rest at the garage</small></span>
            </button>
          )}
          {busy && <p className="muted row"><Spinner />Starting payment</p>}
          {booking.price_type === 'starting_from' && <p className="hint">This is a starting price. The garage may adjust the final bill for your vehicle.</p>}
          <button className="btn btn-ghost btn-block" onClick={onClose}>Pay at the garage instead</button>
        </div>
      )}
    </div>
  );
}
