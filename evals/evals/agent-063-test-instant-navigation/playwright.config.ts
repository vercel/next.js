import { defineConfig } from '@playwright/test'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100'
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15000,
  use: { baseURL, browserName: 'chromium', headless: true },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command:
          'npm run build && npm run start -- --hostname 127.0.0.1 --port 3100',
        url: baseURL,
        timeout: 120000,
        reuseExistingServer: false,
      },
})
