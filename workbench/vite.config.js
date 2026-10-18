import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), splash: resolve(import.meta.dirname, 'splash.html') },
    },
  },
});
