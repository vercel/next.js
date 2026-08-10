//@ts-check

const { chromium, firefox, webkit } = require('playwright')

/**
 * Maps a test browser name (`BROWSER_NAME`) to a Playwright `BrowserType` and
 * the launch options we always use for it.
 *
 * This is a plain CommonJS module so it can be shared between `run-tests.js`
 * (which launches a browser server that's reused across all test suites) and
 * `test/lib/browsers/playwright.ts` (which launches its own browser when no
 * shared server is available, e.g. when running a test directly via the jest
 * CLI). Both must launch the browser with identical options.
 *
 * @param {string} browserName
 * @param {{ headless: boolean }} options
 * @returns {{
 *   browserType: import('playwright').BrowserType,
 *   launchOptions: import('playwright').LaunchOptions,
 * }}
 */
function getBrowserLaunch(browserName, { headless }) {
  if (browserName === 'safari') {
    return { browserType: webkit, launchOptions: { headless } }
  } else if (browserName === 'firefox') {
    return {
      browserType: firefox,
      launchOptions: {
        headless,
        firefoxUserPrefs: {
          // The "fission.webContentIsolationStrategy" pref must be
          // set to 1 on Firefox due to the bug where a new history
          // state is pushed on a page reload.
          // See https://github.com/microsoft/playwright/issues/22640
          // See https://bugzilla.mozilla.org/show_bug.cgi?id=1832341
          'fission.webContentIsolationStrategy': 1,
        },
      },
    }
  } else {
    return {
      browserType: chromium,
      launchOptions: {
        headless,
        args: headless ? [] : ['--auto-open-devtools-for-tabs'],
        ignoreDefaultArgs: ['--disable-back-forward-cache'],
      },
    }
  }
}

module.exports = { getBrowserLaunch }
