import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' },
  },
});
