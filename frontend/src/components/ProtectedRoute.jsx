import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeForRole } from '../lib/format';

// Requires login (and optionally specific roles). Logged-out visitors go to
// /login and come back afterwards; the wrong role goes to their own start page.
export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user, ready, signedOut } = useAuth();
  const location = useLocation();

  if (!ready) return null;
  // After choosing to log out, go home: nothing should send the next person who
  // logs in back to the previous user's page. An expired session returns here.
  if (!isAuthenticated) {
    return signedOut
      ? <Navigate to="/" replace />
      : <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />;
  return children;
}
