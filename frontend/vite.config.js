import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :8081; the proxy lets the app use relative
// /api URLs, so the same build also works when the API serves it directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8081' }
  }
});
