import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { promoOpsApiPlugin } from './server/vite-api-plugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), promoOpsApiPlugin()],
})
