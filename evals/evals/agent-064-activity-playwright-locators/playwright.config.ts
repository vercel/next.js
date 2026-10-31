import { defineConfig } from '@playwright/test'

const port = 3312
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL, trace: 'off' },
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
