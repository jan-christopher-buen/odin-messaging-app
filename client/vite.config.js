import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const proxy = {
  '/api': {
    target: process.env.API_PROXY_TARGET || 'http://localhost:3000',
    changeOrigin: false,
  },
}
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy, port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    maxWorkers: 1,
  },
})
