import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Load MOCK_EMAIL and MOCK_PASSWORD from .env.local.
loadEnvConfig(process.cwd());

const PORT = process.env.PORT || 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results/",
  webServer: {
    command: "npm run dev",
    url: baseURL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "Desktop Chrome", use: devices["Desktop Chrome"] }],
});
