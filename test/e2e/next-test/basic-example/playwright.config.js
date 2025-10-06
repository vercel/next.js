const {
  devices,
  defineConfig,
} = require('next/experimental/testmode/playwright')

module.exports = defineConfig({
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
