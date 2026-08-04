import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
