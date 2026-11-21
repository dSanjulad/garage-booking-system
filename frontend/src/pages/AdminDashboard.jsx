import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { adminService, garageService, userService, errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Alert, AnimatedNumber, Empty, Modal, Skeleton, StarRating, Tabs } from '../components/ui';
import { useUrlTab } from '../lib/useUrlTab';

const useList = (fetcher) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setItems(await fetcher());
      setError('');
    } catch (err) {
      setError(errorMessage(err, "This list couldn't be loaded."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);
  return { items, loading, error, setError, load };
};

function UsersTab() {
  const { user: me } = useAuth();
  const { items: users, loading, error, setError, load } = useList(async () => (await userService.listAll()).data.users);
  const [busyId, setBusyId] = useState(null);

  const changeRole = async (id, role) => {
    setBusyId(id);
    try {
      await userService.updateRole(id, role);
      await load();
    } catch (err) {
      setError(errorMessage(err, "The role couldn't be changed."));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Skeleton height={240} />;
  return (
    <>
      {error && <Alert>{error}</Alert>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Joined</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td className="num">{u.phone || 'Not given'}</td>
                <td>
                  <select className="input input-compact" aria-label={`Role for ${u.name}`} value={u.role} disabled={busyId === u.id || u.id === me.id} onChange={(e) => changeRole(u.id, e.target.value)}>
                    <option value="owner">Vehicle owner</option>
                    <option value="operator">Garage operator</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="sub num">{new Date(u.created_at.replace(' ', 'T')).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GaragesTab() {
  const { items: garages, loading, error, setError, load } = useList(async () => (await garageService.search({ sortBy: 'name' })).data.garages);
  const [busyId, setBusyId] = useState(null);

  const patch = async (id, data) => {
    setBusyId(id);
    try {
      await garageService.update(id, data);
      await load();
    } catch (err) {
      setError(errorMessage(err, "The garage couldn't be updated."));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Skeleton height={240} />;
  return (
    <>
      {error && <Alert>{error}</Alert>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Garage</th><th>Operator</th><th>Rating</th><th>Verified</th><th>Visible</th></tr></thead>
          <tbody>
            {garages.map((g) => (
              <tr key={g.id}>
                <td><b>{g.name}</b><div className="sub">{g.city}</div></td>
                <td>{g.operator_name}</td>
                <td><StarRating rating={Number(g.avg_rating)} count={Number(g.review_count)} size={14} /></td>
                <td><button type="button" role="switch" aria-checked={Boolean(g.is_verified)} aria-label={`Verify ${g.name}`} disabled={busyId === g.id} className={`switch ${g.is_verified ? 'is-on' : ''}`} onClick={() => patch(g.id, { isVerified: !g.is_verified })}><i /></button></td>
                <td><button type="button" role="switch" aria-checked={Boolean(g.is_active)} aria-label={`Show ${g.name} to customers`} disabled={busyId === g.id} className={`switch ${g.is_active ? 'is-on' : ''}`} onClick={() => patch(g.id, { isActive: !g.is_active })}><i /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ReviewsTab() {
  const { items: reviews, loading, error, setError, load } = useList(async () => (await adminService.reviews()).data.reviews);
  const [hiding, setHiding] = useState(null);
  const [reason, setReason] = useState('');

  const moderate = async (id, hidden, why) => {
    try {
      await adminService.moderateReview(id, hidden, why);
      await load();
    } catch (err) {
      setError(errorMessage(err, "The review couldn't be updated."));
    }
  };

  const submitHide = async (e) => {
    e.preventDefault();
    await moderate(hiding.id, true, reason);
    setHiding(null);
    setReason('');
  };

  if (loading) return <Skeleton height={240} />;
  if (!reviews.length) return <Empty icon={BadgeCheck} title="No reviews yet">Reviews appear here after customers complete bookings.</Empty>;
  return (
    <>
      {error && <Alert>{error}</Alert>}
      <p className="muted">Hide reviews only for abuse or evidence of a fake booking. Hidden reviews leave the garage's rating.</p>
      <ul className="moderation">
        {reviews.map((r) => (
          <li key={r.id} className={r.is_hidden ? 'is-hidden' : ''}>
            <div>
              <div className="row"><StarRating rating={r.rating} size={14} /><b>{r.garage_name}</b><span className="muted small">by {r.customer_name}</span></div>
              {r.comment && <p>{r.comment}</p>}
              {Boolean(r.is_hidden) && <p className="small hidden-note">Hidden: {r.hidden_reason}</p>}
            </div>
            {r.is_hidden
              ? <button className="btn btn-outline btn-sm" onClick={() => moderate(r.id, false)}>Restore</button>
              : <button className="btn btn-ghost btn-sm" onClick={() => { setReason(''); setHiding(r); }}>Hide</button>}
          </li>
        ))}
      </ul>
      <Modal open={Boolean(hiding)} onClose={() => setHiding(null)} title="Hide this review?">
        {hiding && (
          <form onSubmit={submitHide}>
            <p>It will disappear from {hiding.garage_name}'s page and rating. You can restore it later.</p>
            <div className="field">
              <label htmlFor="hide-reason">Reason</label>
              <input id="hide-reason" required maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="row">
              <button type="submit" className="btn btn-danger">Hide review</button>
              <button type="button" className="btn btn-outline" onClick={() => setHiding(null)}>Keep visible</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

const CHANNEL_STATUS = { sent: 'badge-completed', logged: 'badge-no_show', failed: 'badge-cancelled' };

function NotificationsTab() {
  const { items, loading, error } = useList(async () => (await adminService.notifications()).data.notifications);
  if (loading) return <Skeleton height={240} />;
  if (error) return <Alert>{error}</Alert>;
  if (!items.length) return <Empty title="No notifications yet">Confirmations and reminders are listed here as they go out.</Empty>;
  return (
    <>
      <p className="muted">"Logged" means email or SMS isn't connected yet, so the message was recorded rather than delivered.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>When</th><th>Type</th><th>Channel</th><th>To</th><th>Result</th></tr></thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id}>
                <td className="sub num">{n.created_at}</td>
                <td>{n.kind.replaceAll('_', ' ')}<div className="sub">{n.subject}</div></td>
                <td>{n.channel === 'sms' ? 'SMS' : 'Email'}</td>
                <td className="sub">{n.recipient}</td>
                <td><span className={`badge ${CHANNEL_STATUS[n.status]}`}>{n.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const TABS = [
  { key: 'users', label: 'Users' },
  { key: 'garages', label: 'Garages' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'notifications', label: 'Notifications' }
];

export default function AdminDashboard() {
  const [tab, setTab] = useUrlTab(TABS.map((t) => t.key), 'users');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    adminService.stats().then((r) => setStats(r.data.stats)).catch(() => {});
  }, []);

  return (
    <div className="container page">
      <div className="page-head"><h1>Admin console</h1></div>

      {stats ? (
        <div className="stats">
          <div className="stat"><b><AnimatedNumber value={stats.users} /></b><span>Users</span><small>{stats.owners} owners, {stats.operators} operators</small></div>
          <div className="stat"><b><AnimatedNumber value={stats.garages} /></b><span>Garages</span><small>{stats.verified_garages} verified</small></div>
          <div className="stat"><b><AnimatedNumber value={stats.bookings} /></b><span>Bookings</span><small>{stats.completed} completed</small></div>
          <div className="stat"><b>{stats.no_show_rate === null ? 'None yet' : <AnimatedNumber value={stats.no_show_rate} decimals={1} suffix="%" />}</b><span>No-show rate</span><small>{stats.no_shows} no-shows</small></div>
          <div className="stat"><b><AnimatedNumber value={stats.reviews} /></b><span>Reviews</span><small>{stats.hidden_reviews} hidden</small></div>
          <div className="stat"><b><AnimatedNumber value={stats.notifications} /></b><span>Notifications</span><small>All channels</small></div>
        </div>
      ) : <Skeleton height={92} style={{ marginBottom: 24 }} />}

      <Tabs label="Admin sections" tabs={TABS} value={tab} onChange={setTab} />
      <div className="card panel console-panel">
        {tab === 'users' && <UsersTab />}
        {tab === 'garages' && <GaragesTab />}
        {tab === 'reviews' && <ReviewsTab />}
        {tab === 'notifications' && <NotificationsTab />}
      </div>
    </div>
  );
}
