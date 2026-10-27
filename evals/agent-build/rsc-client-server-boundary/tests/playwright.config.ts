import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '/tests',
  testMatch: 'behavior.spec.ts',
  forbidOnly: true,
  retries: 0,
  workers: 1,
})
