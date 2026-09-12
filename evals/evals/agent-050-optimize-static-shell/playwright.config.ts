import { defineConfig } from '@playwright/test'

const port = Number(process.env.PORT ?? 3311)
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'off',
  },
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
