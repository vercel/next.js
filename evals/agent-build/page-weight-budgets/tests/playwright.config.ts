import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: __dirname,
  testMatch: 'behavior.spec.ts',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 60_000,
})
