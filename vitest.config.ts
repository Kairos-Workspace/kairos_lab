import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'src/**/__tests__/**/*.{test,spec}.{ts,tsx}'
    ]
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@core': resolve(__dirname, 'src/core')
    }
  }
})
