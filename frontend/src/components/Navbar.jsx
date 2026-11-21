import React, { useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useReviewGate } from '../context/ReviewGate';

export default function Navbar() {
  const { user, isAuthenticated, isOperator, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { pending } = useReviewGate();

  const links = [
    { to: '/', label: 'Find a garage', end: true },
    ...(isAuthenticated && !isOperator ? [{ to: '/my-bookings', label: 'My bookings' }] : []),
    ...(isOperator ? [{ to: '/dashboard', label: 'Garage console' }] : []),
    ...(isAdmin ? [{ to: '/admin', label: 'Admin' }] : [])
  ];

  const handleLogout = () => {
    setOpen(false);
    navigate('/', { replace: true });
    logout();
  };

  // Close the mobile drawer whenever the page changes.
  React.useEffect(() => setOpen(false), [location.pathname]);

  const renderLinks = () => links.map((l) => (
    <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      {({ isActive }) => (
        <>
          {l.label}
          {l.to === '/my-bookings' && pending.length > 0 && <span className="nav-badge" aria-label={`${pending.length} ${pending.length === 1 ? 'review' : 'reviews'} needed`}>{pending.length}</span>}
          {isActive && <motion.span layoutId="nav-bar" className="nav-bar" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
        </>
      )}
    </NavLink>
  ));

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="brand" aria-label="GarageBookLK home">
          <span className="brand-plate" aria-hidden="true">GB</span>
          <span>GarageBook<b>LK</b></span>
        </Link>

        <nav className="nav-links" aria-label="Main">{renderLinks()}</nav>

        <div className="nav-actions">
          {isAuthenticated ? (
            <>
              <span className="nav-user">{user.name.split(' ')[0]}</span>
              <button className="btn btn-outline btn-sm" onClick={handleLogout}><LogOut size={16} aria-hidden="true" />Log out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline btn-sm">Log in</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Sign up</Link>
            </>
          )}
        </div>

        <button className="nav-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div className="nav-drawer">
          <div className="nav-drawer-inner">
            {renderLinks()}
            {isAuthenticated ? (
              <button className="btn btn-outline" onClick={handleLogout}>Log out</button>
            ) : (
              <>
                <Link to="/login" className="btn btn-outline">Log in</Link>
                <Link to="/register" className="btn btn-primary">Sign up</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
