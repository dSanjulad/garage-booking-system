import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CalendarCheck2, Search, SearchX, ShieldCheck, Star } from 'lucide-react';
import { garageService, homeService, errorMessage } from '../services/api';
import FlapBoard from '../components/FlapBoard';
import GarageRow from '../components/GarageRow';
import VehiclePicker from '../components/VehiclePicker';
import { Alert, AnimatedNumber, Empty, Skeleton } from '../components/ui';

const useDebounced = (value, ms) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

export default function Home() {
  const [home, setHome] = useState({ garages: 0, verified_reviews: 0, next_slots: [] });
  const [homeLoading, setHomeLoading] = useState(true);
  const [garages, setGarages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRating, setMinRating] = useState('');
  const [sortBy, setSortBy] = useState('rating');

  const debouncedQ = useDebounced(q, 300);
  const debouncedCity = useDebounced(city, 300);
  const debouncedPrice = useDebounced(maxPrice, 300);
  const latest = useRef(0);

  useEffect(() => {
    const load = () => homeService.get().then((r) => setHome(r.data)).catch(() => {}).finally(() => setHomeLoading(false));
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const ticket = ++latest.current; // a slow old search must not overwrite a newer one
    setLoading(true);
    setError('');
    const params = { sortBy };
    if (debouncedQ) params.q = debouncedQ;
    if (debouncedCity) params.city = debouncedCity;
    if (vehicleType) params.vehicleType = vehicleType;
    if (debouncedPrice) params.maxPrice = debouncedPrice;
    if (minRating) params.minRating = minRating;
    garageService.search(params)
      .then((r) => { if (ticket === latest.current) setGarages(r.data.garages); })
      .catch((err) => { if (ticket === latest.current) setError(errorMessage(err, "Garages couldn't be loaded. Check your connection and try again.")); })
      .finally(() => { if (ticket === latest.current) setLoading(false); });
  }, [debouncedQ, debouncedCity, vehicleType, debouncedPrice, minRating, sortBy]);

  const clearFilters = () => { setQ(''); setCity(''); setVehicleType(''); setMaxPrice(''); setMinRating(''); };
  const scrollToResults = (e) => {
    e.preventDefault();
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1>Book your garage without the phone call</h1>
            <p>Compare independent garages by price and reviews from real, completed bookings. See which bays are free, and reserve one in about a minute.</p>
          </div>
          <FlapBoard rows={home.next_slots} loading={homeLoading} />
        </div>
      </section>

      <div className="container search-wrap">
        <form className="search card" onSubmit={scrollToResults} role="search">
          <VehiclePicker value={vehicleType} onChange={setVehicleType} allowAny />
          <div className="search-fields">
            <div className="field search-q">
              <label htmlFor="q">Service or garage</label>
              <input id="q" placeholder="Brake pads, oil change, hybrid" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" placeholder="Colombo, Dehiwala" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="maxPrice">Max price (Rs.)</label>
              <input id="maxPrice" type="number" min="0" step="500" placeholder="Any" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="minRating">Rating</label>
              <select id="minRating" value={minRating} onChange={(e) => setMinRating(e.target.value)}>
                <option value="">Any rating</option>
                <option value="4">4 stars and up</option>
                <option value="3">3 stars and up</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary search-submit"><Search size={18} aria-hidden="true" />Show garages</button>
          </div>
        </form>
      </div>

      <section className="container results" id="results" aria-live="polite">
        <div className="results-head">
          <h2>{loading ? 'Finding garages' : `${garages.length} ${garages.length === 1 ? 'garage' : 'garages'}`}</h2>
          <div className="sort">
            <label htmlFor="sortBy" className="label">Sort by</label>
            <select id="sortBy" className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="rating">Highest rated</option>
              <option value="price">Lowest price</option>
              <option value="soonest">Soonest available</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        {!garages.length && loading ? (
          <div className="garage-list">{[0, 1, 2].map((i) => <Skeleton key={i} height={84} style={{ marginBottom: 10 }} />)}</div>
        ) : !loading && !garages.length && !error ? (
          <Empty icon={SearchX} title="No garages match these filters">
            <p>Try a nearby city or a higher price limit.</p>
            <button className="btn btn-outline" onClick={clearFilters}>Clear filters</button>
          </Empty>
        ) : (
          <>
            <div className="garage-columns" aria-hidden="true">
              <span>Garage</span><span>Verified reviews</span><span>Next open bay</span><span>Price</span>
            </div>
            <ul className={`garage-list ${loading ? 'is-loading' : ''}`}>
              <AnimatePresence initial={false} mode="popLayout">
                {garages.map((g) => <GarageRow key={g.id} garage={g} />)}
              </AnimatePresence>
            </ul>
          </>
        )}
      </section>

      <section className="trust">
        <div className="container trust-grid">
          <div className="trust-lead">
            <h2>Not sure about a garage you've never used?</h2>
            <p>Anyone can write a review online. Here, you can only review a garage after a booking there has been completed, so every rating comes from a real customer.</p>
          </div>
          <dl className="trust-facts">
            <div>
              <Star aria-hidden="true" />
              <dt><AnimatedNumber value={home.verified_reviews} /></dt>
              <dd>reviews, each tied to one completed booking</dd>
            </div>
            <div>
              <ShieldCheck aria-hidden="true" />
              <dt><AnimatedNumber value={home.garages} /></dt>
              <dd>garages listed, with verified ones marked</dd>
            </div>
            <div>
              <CalendarCheck2 aria-hidden="true" />
              <dt>1 bay, 1 booking</dt>
              <dd>a slot can't be sold twice, even if two people book at the same moment</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
