import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
      // Zoom join page (/join/<code>) is served by the backend, not the React app.
      '/join': 'http://localhost:8000',
    },
  },
});
