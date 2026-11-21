import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

function readStored() {
  try {
    const token = localStorage.getItem('gb_token');
    const user = JSON.parse(localStorage.getItem('gb_user') || 'null');
    return token && user ? { token, user } : { token: null, user: null };
  } catch {
    return { token: null, user: null };
  }
}

export const AuthProvider = ({ children }) => {
  const [{ token, user }, setSession] = useState({ token: null, user: null });
  const [ready, setReady] = useState(false);
  // True after someone chooses to log out, as opposed to a session expiring.
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    setSession(readStored());
    setReady(true);
  }, []);

  const login = useCallback((newToken, newUser) => {
    try {
      localStorage.setItem('gb_token', newToken);
      localStorage.setItem('gb_user', JSON.stringify(newUser));
    } catch { /* private mode: the session simply won't survive a refresh */ }
    setSignedOut(false);
    setSession({ token: newToken, user: newUser });
  }, []);

  const logout = useCallback(({ intentional = true } = {}) => {
    setSignedOut(intentional);
    try {
      localStorage.removeItem('gb_token');
      localStorage.removeItem('gb_user');
    } catch { /* nothing stored */ }
    setSession({ token: null, user: null });
  }, []);

  // An expired token should log the person out instead of failing silently.
  useEffect(() => {
    const onUnauthorised = () => logout({ intentional: false });
    window.addEventListener('gb:unauthorised', onUnauthorised);
    return () => window.removeEventListener('gb:unauthorised', onUnauthorised);
  }, [logout]);

  const isAuthenticated = !!token;
  const isAdmin = user?.role === 'admin';
  const isOperator = user?.role === 'operator' || isAdmin;
  const isOwner = user?.role === 'owner';

  return (
    <AuthContext.Provider value={{ user, token, ready, signedOut, login, logout, isAuthenticated, isAdmin, isOperator, isOwner }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
