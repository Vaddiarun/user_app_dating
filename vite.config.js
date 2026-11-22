import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Only VIBE_* variables reach the browser bundle (instead of Vite's default VITE_*).
  envPrefix: 'VIBE_',
  plugins: [react()],
})
