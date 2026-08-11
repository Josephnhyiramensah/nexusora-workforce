import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: forward /api to the Workforce API on :5002 (same-origin in production).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5002',
    },
  },
});
