/// <reference types="vitest" />

import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/components': resolve(__dirname, 'components'),
      '@/pages': resolve(__dirname, 'pages'),
      '@/styles': resolve(__dirname, 'styles'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './test.setup.js',
  },
})
