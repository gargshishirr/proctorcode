import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Monaco and the face model runtime are big by nature; they load only on the exam page.
    chunkSizeWarningLimit: 6000,
  },
  server: {
    port: 5173,
    proxy: {
      // Keep the browser's Host header so the API's same-origin (CSRF) check passes in development.
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
});
