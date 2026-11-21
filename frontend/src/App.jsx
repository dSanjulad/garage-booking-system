import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AuthProvider } from './context/AuthContext';
import { ReviewGateProvider } from './context/ReviewGate';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import GarageDetail from './pages/GarageDetail';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MyBookings from './pages/MyBookings';
import OperatorDashboard from './pages/OperatorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import NotFound from './pages/NotFound';

// Pages fade in with a CSS animation (see .page-enter). There is deliberately no
// exit animation: holding the next page back until the old one finished leaving
// made buttons appear dead, or left a blank page, until the browser was refreshed.
function Page({ children }) {
  return <main className="page-enter">{children}</main>;
}

function AnimatedRoutes() {
  const location = useLocation();
  // Dashboard sub-state lives inside the page, so key on the first path segment.
  const key = location.pathname.split('/').slice(0, 2).join('/') + (location.pathname.startsWith('/garages/') ? location.pathname : '');
  React.useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <Routes location={location} key={key}>
      <Route path="/" element={<Page><Home /></Page>} />
      <Route path="/garages/:id" element={<Page><GarageDetail /></Page>} />
      <Route path="/login" element={<Page><LoginPage /></Page>} />
      <Route path="/register" element={<Page><RegisterPage /></Page>} />
      <Route path="/my-bookings" element={<ProtectedRoute roles={['owner']}><Page><MyBookings /></Page></ProtectedRoute>} />
      <Route path="/dashboard/*" element={<ProtectedRoute roles={['operator', 'admin']}><Page><OperatorDashboard /></Page></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Page><AdminDashboard /></Page></ProtectedRoute>} />
      <Route path="*" element={<Page><NotFound /></Page>} />
    </Routes>
  );
}

export default function App() {
  return (
    // "user" makes every animation here respect the visitor's reduced-motion setting.
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <ReviewGateProvider>
        <Router>
          <Navbar />
          <AnimatedRoutes />
          <footer className="footer">
            <div className="container">
              <span>© {new Date().getFullYear()} GarageBookLK. Book trusted garages across the Colombo district.</span>
              <span>Mon to Sat support: 8:30 am to 5:30 pm</span>
            </div>
          </footer>
        </Router>
        </ReviewGateProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
