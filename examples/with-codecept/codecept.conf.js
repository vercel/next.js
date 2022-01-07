const { setHeadlessWhen } = require('@codeceptjs/configure')

// turn on headless mode when running with HEADLESS=true environment variable
// export HEADLESS=true && npx codeceptjs run
setHeadlessWhen(process.env.HEADLESS)

exports.config = {
  tests: './e2e/**/*_test.js',
  output: './output',
  helpers: {
    Playwright: {
      url: 'http://localhost:3000',
      show: false,
      browser: 'chromium',
    },
  },
  include: {
    I: './e2e/steps_file.js',
  },
  bootstrap: null,
  mocha: {},
  name: 'with-codecept',
  plugins: {
    pauseOnFail: {},
    retryFailedStep: {
      enabled: true,
    },
    tryTo: {
      enabled: true,
    },
    screenshotOnFail: {
      enabled: true,
    },
  },
}
