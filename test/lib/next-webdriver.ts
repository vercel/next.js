import { getFullUrl, waitFor } from 'next-test-utils'
import type { Playwright, NavigationOptions } from './browsers/playwright'
import type { Page } from 'playwright'
import type {
  PlaywrightManager,
  BrowserOptions,
  BrowserContextOptions,
} from './browsers/utils/playwright-manager'
import { createAfterCurrentTest } from './browsers/utils/after-current-test'

export type { Playwright }

let playwrightManager: PlaywrightManager | null = null
const lazilyInitializePlaywrightManager = async () => {
  const { PlaywrightManager } = await import('./browsers/playwright')
  playwrightManager = new PlaywrightManager()
  return playwrightManager
}

const afterCurrentTest = createAfterCurrentTest()

afterAll(async () => {
  if (playwrightManager) {
    await playwrightManager.closeWithReason(
      'cleaning up playwright after all tests are finished'
    )
  }
})

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
   * disable javascript
   */
  disableJavaScript?: boolean
  cpuThrottleRate?: number
  pushErrorAsConsoleLog?: boolean
  /**
   * @deprecated Calling `next.browser()` multiple times in a single test is not recommended.
   * If you need to navigate to a new page, use `browser.get(path)`
   *
   * If you REALLY need multiple browsers running in parallel, set this option to true.
   */
  inefficientlyCreateAdditionalBrowserInstance?: boolean
} & Partial<Omit<BrowserOptions, 'enableTracing'>> &
  Partial<Omit<BrowserContextOptions, 'javaScriptEnabled'>> &
  NavigationOptions

/**
 *
 * @param appPortOrUrl can either be the port or the full URL
 * @param url the path/query to append when using appPort
 * @returns thenable browser instance
 */
export default async function webdriver(
  appPortOrUrl: string | number,
  url: string,
  options: WebdriverOptions = {}
): Promise<Playwright> {
  const {
    waitHydration = true,
    retryWaitHydration = false,
    disableCache = false,
    beforePageLoad,
    cpuThrottleRate = undefined,
    pushErrorAsConsoleLog = false,

    disableJavaScript = false,
    inefficientlyCreateAdditionalBrowserInstance:
      createSecondaryInstance = false,
    ...rest
  } = options

  const playwrightManager = await lazilyInitializePlaywrightManager()

  // TODO: this can change if the next server is stopped and started again
  // we have some tests work around this:
  // - test/development/app-dir/dev-indicator/hide-button.test.ts
  // - test/e2e/persistent-caching/persistent-caching.test.ts
  const baseUrl = getFullUrl(appPortOrUrl, '', 'localhost')

  const browser = await playwrightManager.createInstance({
    ...rest,
    javaScriptEnabled: !disableJavaScript,
    createSecondaryInstance,
  })
  browser.setBaseUrl(baseUrl)

  afterCurrentTest(async () => {
    if (!browser.isClosed()) {
      await playwrightManager.closeInstance(
        browser,
        'cleaning up playwright after the test is finished'
      )
    }
  })
  ;(global as any).browserName =
    playwrightManager.sharedState!.browserOptions.browserName

  // TODO: `appPortOrUrl` can change if the next server is stopped and started again
  // some tests work around this:
  // - test/production/prerender-prefetch/index.test.ts
  // - test/development/app-dir/dev-indicator/hide-button.test.ts
  const fullUrl = getFullUrl(appPortOrUrl, url, 'localhost')

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

  // This is a temporary workaround for turbopack starting watching too late.
  // So we delay file changes to give it some time
  // to connect the WebSocket and start watching.
  if (process.env.IS_TURBOPACK_TEST) {
    await waitFor(1000)
  }
  return browser
}
