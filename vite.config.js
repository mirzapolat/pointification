import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the SPA runs on Vite and the API/SSE/logo routes are proxied
// to the Node server (`npm run dev:server`), so the browser sees one origin and
// the session cookie works exactly as it does in production.
const API_TARGET = process.env.VITE_API_TARGET || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/logos': { target: API_TARGET, changeOrigin: false },
    },
  },
})
