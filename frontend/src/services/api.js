import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

// Attach the JWT to every request once the user is logged in.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 on anything but the login form means the session has ended.
api.interceptors.response.use((res) => res, (err) => {
  const url = err.config?.url || '';
  if (err.response?.status === 401 && !url.startsWith('/auth/login') && localStorage.getItem('gb_token')) {
    window.dispatchEvent(new Event('gb:unauthorised'));
  }
  return Promise.reject(err);
});

export const errorMessage = (err, fallback) => err?.response?.data?.message || fallback;

export const authService = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me')
};

export const homeService = { get: () => api.get('/home') };

export const garageService = {
  search: (params) => api.get('/garages', { params }),
  getById: (id) => api.get(`/garages/${id}`),
  getMine: () => api.get('/garages/mine'),
  stats: (id) => api.get(`/garages/${id}/stats`),
  create: (data) => api.post('/garages', data),
  update: (id, data) => api.put(`/garages/${id}`, data),
  remove: (id) => api.delete(`/garages/${id}`)
};

export const serviceService = {
  listForGarage: (garageId) => api.get(`/garages/${garageId}/services`),
  listAll: (garageId) => api.get(`/garages/${garageId}/services/all`),
  create: (garageId, data) => api.post(`/garages/${garageId}/services`, data),
  update: (id, data) => api.put(`/services/${id}`, data),
  remove: (id) => api.delete(`/services/${id}`)
};

export const slotService = {
  listForGarageAndDate: (garageId, date, serviceId) =>
    api.get(`/garages/${garageId}/slots`, { params: { date, serviceId } }),
  availability: (garageId, days = 14) => api.get(`/garages/${garageId}/availability`, { params: { days } }),
  generate: (garageId, data) => api.post(`/garages/${garageId}/slots/generate`, data),
  remove: (id) => api.delete(`/slots/${id}`)
};

export const bookingService = {
  create: (data) => api.post('/bookings', data),
  my: () => api.get('/bookings/my'),
  pendingReviews: () => api.get('/bookings/my/pending-reviews'),
  get: (id) => api.get(`/bookings/${id}`),
  forGarage: (garageId) => api.get(`/bookings/garage/${garageId}`),
  cancel: (id) => api.patch(`/bookings/${id}/cancel`),
  reschedule: (id, slotId) => api.patch(`/bookings/${id}/reschedule`, { slotId }),
  updateStatus: (id, status) => api.patch(`/bookings/${id}/status`, { status }),
  updateStage: (id, stage, note) => api.patch(`/bookings/${id}/stage`, { stage, note }),
  confirmService: (id) => api.patch(`/bookings/${id}/confirm-service`),
  review: (bookingId, data) => api.post(`/bookings/${bookingId}/review`, data)
};

export const paymentService = {
  config: () => api.get('/payments/config'),
  start: (bookingId, paymentType) => api.post(`/bookings/${bookingId}/payments`, { paymentType }),
  simulate: (paymentId, outcome) => api.post(`/payments/${paymentId}/simulate`, { outcome })
};

export const reviewService = {
  listForGarage: (garageId) => api.get(`/garages/${garageId}/reviews`)
};

export const userService = {
  listAll: () => api.get('/users'),
  updateRole: (id, role) => api.patch(`/users/${id}/role`, { role })
};

export const adminService = {
  stats: () => api.get('/admin/stats'),
  notifications: () => api.get('/admin/notifications'),
  reviews: () => api.get('/admin/reviews'),
  moderateReview: (id, hidden, reason) => api.patch(`/admin/reviews/${id}`, { hidden, reason })
};

export default api;
