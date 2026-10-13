import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The backend is reached through the same origin, so the session cookie and CSRF token work
    // without CORS. In production a reverse proxy does the same.
    proxy: {
      '/api': { target: process.env.FNP_API_URL ?? 'http://127.0.0.1:8001', changeOrigin: false },
    },
  },
})
