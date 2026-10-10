import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the static build works from any path (GitHub Pages, file hosts).
export default defineConfig({
  base: './',
  plugins: [react()],
})
