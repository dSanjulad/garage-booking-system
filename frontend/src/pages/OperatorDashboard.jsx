import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Plus, Warehouse, X } from 'lucide-react';
import { garageService, errorMessage } from '../services/api';
import GarageSettingsForm from '../components/GarageSettingsForm';
import ServicesManager from '../components/ServicesManager';
import AvailabilityManager from '../components/AvailabilityManager';
import BookingsManager from '../components/BookingsManager';
import GarageOverview from '../components/GarageOverview';
import { Alert, Empty, Skeleton, Tabs } from '../components/ui';
import { useUrlTab } from '../lib/useUrlTab';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'services', label: 'Services and prices' },
  { key: 'availability', label: 'Availability' },
  { key: 'settings', label: 'Garage settings' }
];

export default function OperatorDashboard() {
  const [garages, setGarages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useUrlTab(TABS.map((t) => t.key), 'overview');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await garageService.getMine();
      setGarages(res.data.garages);
      setSelectedId((current) => current ?? res.data.garages[0]?.id ?? null);
    } catch (err) {
      setError(errorMessage(err, "Your garages couldn't be loaded. Refresh to try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = garages.find((g) => g.id === selectedId);

  const handleCreate = async (payload) => {
    const res = await garageService.create(payload);
    setShowCreate(false);
    await load();
    setSelectedId(res.data.garage.id);
    setTab('services');
  };

  const handleUpdate = async (payload) => {
    await garageService.update(selectedId, payload);
    await load();
  };

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Garage console</h1>
        <button className="btn btn-primary" aria-expanded={showCreate} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? <><X size={18} aria-hidden="true" />Close</> : <><Plus size={18} aria-hidden="true" />List a garage</>}
        </button>
      </div>
      {error && <Alert>{error}</Alert>}

      <AnimatePresence initial={false}>
        {showCreate && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }} style={{ overflow: 'hidden' }}>
            <div className="card panel" style={{ marginBottom: 20 }}>
              <h2>List a garage</h2>
              <GarageSettingsForm onSubmit={handleCreate} submitLabel="List garage" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? <Skeleton height={320} /> : garages.length === 0 ? (
        !showCreate && (
          <Empty icon={Warehouse} title="List your first garage">
            <p>Add your hours and bays, then your services, and customers can start booking.</p>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>List a garage</button>
          </Empty>
        )
      ) : (
        <>
          {garages.length > 1 && (
            <div className="garage-switch" role="group" aria-label="Choose a garage">
              {garages.map((g) => (
                <button key={g.id} type="button" aria-pressed={g.id === selectedId} className={`garage-chip ${g.id === selectedId ? 'is-on' : ''}`} onClick={() => setSelectedId(g.id)}>
                  <b>{g.name}</b><span>{g.city}</span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <>
              <div className="console-title">
                <h2>{selected.name}</h2>
                {Boolean(selected.is_verified) && <span className="badge badge-verified"><BadgeCheck size={15} aria-hidden="true" />Verified</span>}
                {!selected.is_active && <span className="badge badge-no_show">Hidden from customers</span>}
              </div>
              <Tabs label="Garage sections" tabs={TABS} value={tab} onChange={setTab} />
              <div className="card panel console-panel" key={`${selected.id}-${tab}`}>
                {tab === 'overview' && <GarageOverview garageId={selected.id} />}
                {tab === 'bookings' && <BookingsManager garageId={selected.id} />}
                {tab === 'services' && <ServicesManager garageId={selected.id} />}
                {tab === 'availability' && <AvailabilityManager garage={selected} />}
                {tab === 'settings' && (
                  <div>
                    <h2>Garage settings</h2>
                    <GarageSettingsForm initial={selected} onSubmit={handleUpdate} submitLabel="Save changes" />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
