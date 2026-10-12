import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate admin app. Dev server on 5174; proxies /api to the Workforce API so
// the console and product share one backend in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': { target: process.env.API_URL || 'http://localhost:5002', changeOrigin: true } },
  },
  build: { outDir: 'dist' },
});
