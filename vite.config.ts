import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5863',
      '/stream': 'http://localhost:5863',
      '/healthz': 'http://localhost:5863',
      '/openapi.json': 'http://localhost:5863',
    },
  },
});
