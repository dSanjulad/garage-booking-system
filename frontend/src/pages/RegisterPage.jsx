import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Car, Wrench } from 'lucide-react';
import { authService, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import { Alert, Spinner } from '../components/ui';

const ROLES = [
  { value: 'owner', icon: Car, title: 'I own a vehicle', text: 'Compare garages and book services.' },
  { value: 'operator', icon: Wrench, title: 'I run a garage', text: 'List your garage and manage bookings.' }
];

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'owner' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authService.register(form);
      login(res.data.token, res.data.user);
      navigate(form.role === 'operator' ? '/dashboard' : '/');
    } catch (err) {
      setError(errorMessage(err, "Couldn't reach the server. Check your connection and try again."));
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="One account, every garage" intro="Book with any garage on GarageBookLK, or list your own and take bookings without the paper diary.">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Create an account</h1>
        {error && <Alert>{error}</Alert>}

        <div className="role-picker" role="radiogroup" aria-label="Account type">
          {ROLES.map((r) => {
            const selected = form.role === r.value;
            return (
              <button key={r.value} type="button" role="radio" aria-checked={selected} className={`role-option ${selected ? 'is-on' : ''}`} onClick={() => setForm((f) => ({ ...f, role: r.value }))}>
                {selected && <motion.span layoutId="role-ring" className="role-ring" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <r.icon size={22} aria-hidden="true" />
                <b>{r.title}</b>
                <span>{r.text}</span>
              </button>
            );
          })}
        </div>

        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" required maxLength={120} value={form.name} onChange={update('name')} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone (optional)</label>
          <input id="phone" type="tel" autoComplete="tel" placeholder="07X XXX XXXX" maxLength={30} value={form.phone} onChange={update('phone')} />
          <span className="hint">The garage uses this if it needs to reach you about your vehicle.</span>
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" required minLength={6} maxLength={72} value={form.password} onChange={update('password')} />
          <span className="hint">At least 6 characters.</span>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? <><Spinner />Creating account</> : 'Create account'}
        </button>
        <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </AuthLayout>
  );
}
