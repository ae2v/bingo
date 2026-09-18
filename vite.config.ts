import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  server: {
    allowedHosts: ['.ngrok-free.dev', 'ngrok-free.dev'],
    headers: { 'Permissions-Policy': 'camera=(self)' },
    proxy: { '/api': 'http://localhost:8787' }
  }
});
