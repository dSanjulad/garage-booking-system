import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { serviceService, errorMessage } from '../services/api';
import { Alert, Empty, Modal, Skeleton, Spinner } from './ui';
import { PRICE_TYPES, VEHICLES, money, vehicleLabel } from '../lib/format';

const ALL_TYPES = VEHICLES.map((v) => v.value);
const BLANK = { name: '', description: '', price: '', priceType: 'fixed', durationMinutes: 60, vehicleTypes: ALL_TYPES };

export default function ServicesManager({ garageId }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await serviceService.listAll(garageId);
      setServices(res.data.services);
    } catch (err) {
      setError(errorMessage(err, "Services couldn't be loaded."));
    } finally {
      setLoading(false);
    }
  }, [garageId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggleVehicle = (v) => setForm((f) => ({
    ...f, vehicleTypes: f.vehicleTypes.includes(v) ? f.vehicleTypes.filter((x) => x !== v) : [...f.vehicleTypes, v]
  }));

  const startEdit = (s) => {
    setEditingId(s.id);
    setError('');
    setForm({
      name: s.name, description: s.description || '', price: Number(s.price), priceType: s.price_type,
      durationMinutes: s.duration_minutes, vehicleTypes: s.vehicle_types.split(',')
    });
  };
  const cancelEdit = () => { setEditingId(null); setForm(BLANK); setError(''); };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.vehicleTypes.length) { setError('Choose at least one vehicle type.'); return; }
    setSaving(true);
    const payload = { ...form, price: Number(form.price), durationMinutes: Number(form.durationMinutes) };
    try {
      if (editingId) await serviceService.update(editingId, payload);
      else await serviceService.create(garageId, payload);
      cancelEdit();
      await load();
    } catch (err) {
      setError(errorMessage(err, "The service couldn't be saved."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s) => {
    setError('');
    try {
      await serviceService.update(s.id, { isActive: !s.is_active });
      await load();
    } catch (err) {
      setError(errorMessage(err, "The service couldn't be updated."));
    }
  };

  const confirmRemove = async () => {
    setError('');
    try {
      await serviceService.remove(removing.id);
      await load();
    } catch (err) {
      setError(errorMessage(err, "The service couldn't be removed."));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      <h2>Services and prices</h2>
      {error && <Alert>{error}</Alert>}
      {loading ? <Skeleton height={140} /> : services.length === 0 ? (
        <Empty title="No services yet">Add your first service below so customers can book it.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Service</th><th>Price</th><th>Time</th><th>Vehicles</th><th>Customers see it</th><th /></tr></thead>
            <tbody>
              {services.map((s) => {
                const types = s.vehicle_types.split(',');
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b>{s.description && <div className="sub">{s.description}</div>}</td>
                    <td className="num">{money(s.price)}<div className="sub">{PRICE_TYPES[s.price_type].label}</div></td>
                    <td className="num">{s.duration_minutes} min</td>
                    <td className="sub">{types.length === ALL_TYPES.length ? 'All vehicles' : types.map(vehicleLabel).join(', ')}</td>
                    <td>
                      <button type="button" role="switch" aria-checked={Boolean(s.is_active)} aria-label={`Show ${s.name} to customers`} className={`switch ${s.is_active ? 'is-on' : ''}`} onClick={() => toggleActive(s)}><i /></button>
                    </td>
                    <td className="actions">
                      <button className="btn btn-ghost btn-sm" aria-label={`Edit ${s.name}`} onClick={() => startEdit(s)}><Pencil size={16} aria-hidden="true" /></button>
                      <button className="btn btn-ghost btn-sm" aria-label={`Remove ${s.name}`} onClick={() => setRemoving(s)}><Trash2 size={16} aria-hidden="true" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <hr className="divider" />
      <form onSubmit={handleSave}>
        <h3>{editingId ? 'Edit service' : 'Add a service'}</h3>
        <div className="form-row">
          <div className="field"><label htmlFor="s-name">Service name</label><input id="s-name" required maxLength={150} value={form.name} onChange={update('name')} /></div>
          <div className="field"><label htmlFor="s-desc">Description (optional)</label><input id="s-desc" maxLength={2000} value={form.description} onChange={update('description')} /></div>
        </div>
        <div className="form-row form-row-3">
          <div className="field"><label htmlFor="s-price">Price (Rs.)</label><input id="s-price" type="number" min={0} step="50" required value={form.price} onChange={update('price')} /></div>
          <div className="field">
            <label htmlFor="s-ptype">How the price works</label>
            <select id="s-ptype" value={form.priceType} onChange={update('priceType')}>
              {Object.entries(PRICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="s-dur">Time needed (min)</label><input id="s-dur" type="number" min={5} max={600} step={5} required value={form.durationMinutes} onChange={update('durationMinutes')} /></div>
        </div>
        <fieldset className="field day-picker">
          <legend className="label">Vehicles covered</legend>
          <div className="row">
            {VEHICLES.map((v) => (
              <button key={v.value} type="button" aria-pressed={form.vehicleTypes.includes(v.value)} className={`day ${form.vehicleTypes.includes(v.value) ? 'is-on' : ''}`} onClick={() => toggleVehicle(v.value)}>{v.label}</button>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <><Spinner />Saving</> : editingId ? 'Save service' : 'Add service'}</button>
          {editingId && <button type="button" className="btn btn-outline" onClick={cancelEdit}>Cancel edit</button>}
        </div>
      </form>

      <Modal open={Boolean(removing)} onClose={() => setRemoving(null)} title="Remove this service?">
        {removing && (
          <>
            <p>{removing.name} will be deleted. A service with past bookings can't be removed, so turn it off for customers instead.</p>
            <div className="row">
              <button className="btn btn-danger" onClick={confirmRemove}>Remove service</button>
              <button className="btn btn-outline" onClick={() => setRemoving(null)}>Keep service</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
