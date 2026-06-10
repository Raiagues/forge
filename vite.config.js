import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Stable Rollup/esbuild-based Vite 5 config.
// No rolldown, no native bindings to break — runs on Node 20.18+.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    host: true,
    strictPort: false,
    open: false,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
})
