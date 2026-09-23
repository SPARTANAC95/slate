import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // the proxy's provider code is plain js, but its date parsing still needs
    // pinning down — steam publishes release dates as prose
    include: ['src/**/*.test.ts', 'server/**/*.test.js', 'tools/**/*.test.js'],
  },
});
