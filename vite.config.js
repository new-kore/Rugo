import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import path from 'node:path';

// `vite build --mode standalone` bundles the server routes into the page (no backend needed).
export default defineConfig(({ mode }) => ({
  base: mode === 'standalone' ? './' : '/',
  resolve: {
    alias: [
      { find: '@backend', replacement: path.resolve(mode === 'standalone' ? 'src/standalone/backend.js' : 'src/standalone/remote.js') },
      ...(mode === 'standalone' ? [{ find: /^\.\/db\.js$/, replacement: path.resolve('src/standalone/memdb.js') }] : []),
    ],
  },
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900, outDir: mode === 'standalone' ? 'dist-standalone' : 'dist' },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000' },
  },
}));
