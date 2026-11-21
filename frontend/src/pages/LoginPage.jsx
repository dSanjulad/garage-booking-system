import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authService, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import { homeForRole } from '../lib/format';
import { Alert, Spinner } from '../components/ui';

const DEMO = [
  { label: 'Vehicle owner', email: 'owner@example.com', password: 'password123' },
  { label: 'Garage operator', email: 'kasun@colomboautoworks.lk', password: 'password123' },
  { label: 'Admin', email: 'admin@garagebooking.lk', password: 'admin123' }
];
// Quick sign-in buttons are hidden unless explicitly switched on for development:
// put VITE_SHOW_DEMO_ACCOUNTS=true in frontend/.env.local and restart `npm run dev`.
const SHOW_DEMO = import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authService.login({ email, password });
      login(res.data.token, res.data.user);
      navigate(location.state?.from || homeForRole(res.data.user.role));
    } catch (err) {
      setError(errorMessage(err, "Couldn't reach the server. Check your connection and try again."));
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Your service history, in one place" intro="See upcoming appointments, follow your vehicle through the workshop, and review the garage afterwards.">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Log in</h1>
        {error && <Alert>{error}</Alert>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? <><Spinner />Logging in</> : 'Log in'}
        </button>
        <p className="auth-switch">New here? <Link to="/register">Create an account</Link></p>

        {SHOW_DEMO && (
          <div className="demo-accounts">
            <span className="label">Quick sign-in</span>
            <div className="row">
              {DEMO.map((d) => (
                <button key={d.email} type="button" className="btn btn-outline btn-sm" onClick={() => { setEmail(d.email); setPassword(d.password); }}>{d.label}</button>
              ))}
            </div>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
