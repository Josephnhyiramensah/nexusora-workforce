import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: forward /api to the Workforce API on :5002 (same-origin in production).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,                 // listen on 0.0.0.0 so a phone on the LAN can reach the dev server
    proxy: {
      '/api': {
        target: 'http://localhost:5002',
        changeOrigin: true,
        // When the client is opened from a phone (http://192.168.x.x:5173), the
        // browser tags API calls with that LAN origin, which the API's CORS
        // doesn't trust. Rewrite the proxied request's Origin to the trusted
        // dev origin so login works from a real device. Dev-only (no proxy in prod).
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => { proxyReq.setHeader('origin', 'http://localhost:5173'); });
        },
      },
    },
  },
});
