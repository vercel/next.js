const { withNext, devices } = require('next/experimental/testmode/playwright')

/*
 * Specify any additional Playwright config options here.
 * They will be deep merged with Next.js' default Playwright config.
 * You can access the default config by using a function: \`withNext((config) => {})\`
 */

module.exports = withNext((config) => {
  config.projects = [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ]
  return config
})
