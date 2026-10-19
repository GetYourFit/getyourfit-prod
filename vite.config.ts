import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'; connect-src 'self' https://huggingface.co https://*.hf.co ws://127.0.0.1:5173 ws://localhost:5173; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    },
    proxy: {
      '/api': { target: 'http://127.0.0.1:4174', changeOrigin: true },
    },
  },
  preview: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://huggingface.co https://*.hf.co; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    },
  },
});
