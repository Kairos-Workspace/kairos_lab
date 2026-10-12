import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'resources'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@core': resolve(__dirname, 'src/core')
    }
  },
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
})
