import { getFullUrl, waitFor } from 'next-test-utils'
import os from 'os'
import type { NavigationOptions, Playwright } from './browsers/playwright'
import { Page } from 'playwright'

export type { Playwright }

if (!process.env.TEST_FILE_PATH) {
  process.env.TEST_FILE_PATH = module.parent!.filename
}

let deviceIP: string
const isBrowserStack = !!process.env.BROWSERSTACK
;(global as any).browserName = process.env.BROWSER_NAME || 'chrome'

if (isBrowserStack) {
  const nets = os.networkInterfaces()
  for (const key of Object.keys(nets)) {
    let done = false

    for (const item of nets[key]!) {
      if (item.family === 'IPv4' && !item.internal) {
        deviceIP = item.address
        done = true
        break
      }
    }
    if (done) break
  }
}

let browserTeardown: (() => Promise<void>)[] = []
let browserQuit: (() => Promise<void>) | undefined

if (typeof afterAll === 'function') {
  afterAll(async () => {
    await Promise.all(browserTeardown.map((f) => f())).catch((e) =>
      console.error('browser teardown', e)
    )

    if (browserQuit) {
      await browserQuit()
    }
  })
}

export type WebdriverOptions = {
  /**
   * disable cache for page load
   */
  disableCache?: boolean
  /**
   * the callback receiving page instance before loading page
   * @param page
   * @returns
   */
  beforePageLoad?: (page: Page) => void
  /**
   * browser locale
   */
  locale?: string
  /**
   * disable javascript
   */
  disableJavaScript?: boolean
  headless?: boolean
  /**
   * ignore https errors
   */
  ignoreHTTPSErrors?: boolean
  cpuThrottleRate?: number
  pushErrorAsConsoleLog?: boolean

  /**
   * Override the user agent
   */
  userAgent?: string
} & NavigationOptions

/**
 *
 * @param appPortOrUrl can either be the port or the full URL
 * @param url the path/query to append when using appPort
 * @returns thenable browser instance
 */
export default async function webdriver(
  appPortOrUrl: string | number,
  url: string,
  options?: WebdriverOptions
): Promise<Playwright> {
  const defaultOptions = {
    waitHydration: true,
    retryWaitHydration: false,
    disableCache: false,
  }
  options = Object.assign(defaultOptions, options)
  const {
    waitHydration,
    retryWaitHydration,
    disableCache,
    beforePageLoad,
    locale,
    disableJavaScript,
    ignoreHTTPSErrors,
    headless,
    cpuThrottleRate,
    pushErrorAsConsoleLog,
    userAgent,
  } = options

  const { Playwright, quit } = await import('./browsers/playwright')
  browserQuit = quit

  // TODO: this can change if the next server is stopped and started again
  // we have some tests work around this:
  // - test/development/app-dir/dev-indicator/hide-button.test.ts
  // - test/e2e/persistent-caching/persistent-caching.test.ts
  const baseUrl = getFullUrl(
    appPortOrUrl,
    '',
    isBrowserStack ? deviceIP : 'localhost'
  )

  const browser = new Playwright(baseUrl)
  const browserName = process.env.BROWSER_NAME || 'chrome'
  await browser.setup(
    browserName,
    locale!,
    !disableJavaScript,
    Boolean(ignoreHTTPSErrors),
    // allow headless to be overwritten for a particular test
    typeof headless !== 'undefined' ? headless : !!process.env.HEADLESS,
    userAgent
  )
  ;(global as any).browserName = browserName

  const fullUrl = getFullUrl(
    appPortOrUrl,
    url,
    isBrowserStack ? deviceIP : 'localhost'
  )

  console.log(`\n> Loading browser with ${fullUrl}\n`)

  await browser.loadPage(fullUrl, {
    disableCache,
    cpuThrottleRate,
    beforePageLoad,
    pushErrorAsConsoleLog,
    waitHydration,
    retryWaitHydration,
  })
  console.log(`\n> Loaded browser with ${fullUrl}\n`)

  browserTeardown.push(browser.close.bind(browser))

  // This is a temporary workaround for turbopack starting watching too late.
  // So we delay file changes to give it some time
  // to connect the WebSocket and start watching.
  if (process.env.IS_TURBOPACK_TEST) {
    await waitFor(1000)
  }
  return browser
}
