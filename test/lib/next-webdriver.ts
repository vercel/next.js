import { getFullUrl, waitFor } from 'next-test-utils'
import os from 'os'
import type {
  BrowserContextOptions,
  BrowserContextWrapper,
  BrowserOptions,
  Playwright,
  SharedPlaywrightState,
  NavigationOptions,
} from './browsers/playwright'
import type { Page } from 'playwright'

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

function createAfterCurrentTest() {
  const afterCurrentTestCallbacks = new Set<() => Promise<void>>()

  afterEach(async () => {
    for (const callback of afterCurrentTestCallbacks) {
      await callback()
    }
    afterCurrentTestCallbacks.clear()
  })

  return function afterCurrentTest(cb: () => void | Promise<void>) {
    const wrapped = async () => {
      try {
        await cb()
      } finally {
        afterCurrentTestCallbacks.delete(wrapped)
      }
    }
    afterCurrentTestCallbacks.add(wrapped)
  }
}

const afterCurrentTest = createAfterCurrentTest()

let sharedState: SharedPlaywrightState | null = null
let previousBrowser: Playwright | null = null

afterAll(async () => {
  if (sharedState) {
    await sharedState.close()
    sharedState = null
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
    locale = undefined,
    disableJavaScript = false,
    ignoreHTTPSErrors = false,
    headless = !!process.env.HEADLESS,
    cpuThrottleRate = undefined,
    pushErrorAsConsoleLog = false,
    userAgent = undefined,
    inefficientlyCreateAdditionalBrowserInstance:
      createSecondaryInstance = false,
  } = options

  if (previousBrowser && !createSecondaryInstance) {
    // the previous browser will be cleaned up after the current test
    // (or by manually calling `browser.close()` in legacy tests),
    // so we don't need to do any cleanup here
    throw new Error(
      'Calling `next.browser()` multiple times in a single test is not recommended. ' +
        'If you need to navigate to a new page, use `browser.get(path)` instead. \n' +
        'If you REALLY need multiple browsers running in parallel, pass `inefficientlyCreateAdditionalBrowserInstance: true` when creating the second browser.'
    )
  } else if (!previousBrowser && createSecondaryInstance) {
    throw new Error(
      '`inefficientlyCreateAdditionalBrowserInstance: true` can only be passed to the second browser created within a test.'
    )
  }
  const { Playwright, SharedPlaywrightState } = await import(
    './browsers/playwright'
  )

  const browserOptions: BrowserOptions = {
    browserName: process.env.BROWSER_NAME || 'chrome',
    headless,
    enableTracing: !!process.env.TRACE_PLAYWRIGHT,
  }
  const browserContextOptions: BrowserContextOptions = {
    locale,
    javaScriptEnabled: !disableJavaScript,
    ignoreHTTPSErrors,
    userAgent,
    deviceName: process.env.DEVICE_NAME || undefined,
  }

  let context: BrowserContextWrapper
  if (!sharedState) {
    sharedState = await SharedPlaywrightState.create(
      browserOptions,
      browserContextOptions
    )
    context = sharedState.defaultContext
  } else {
    if (createSecondaryInstance) {
      if (!sharedState.canReuseBrowser(browserOptions)) {
        throw new Error(
          `Changing the following options for a secondary browser is not supported: ${Object.keys(
            browserOptions
          )
            .map((name) => JSON.stringify(name))
            .join(', ')}`
        )
      }
      context = await sharedState.createSecondaryBrowserContext(
        browserContextOptions
      )
    } else {
      if (sharedState.canReuseBrowser(browserOptions)) {
        context = await sharedState.updateDefaultBrowserContext(
          browserContextOptions
        )
      } else {
        await sharedState.close()
        sharedState = await SharedPlaywrightState.create(
          browserOptions,
          browserContextOptions
        )
        context = sharedState.defaultContext
      }
    }
  }

  // TODO: this can change if the next server is stopped and started again
  // we have some tests work around this:
  // - test/development/app-dir/dev-indicator/hide-button.test.ts
  // - test/e2e/persistent-caching/persistent-caching.test.ts
  const baseUrl = getFullUrl(
    appPortOrUrl,
    '',
    isBrowserStack ? deviceIP : 'localhost'
  )

  const browser = new Playwright(sharedState, context, baseUrl)
  previousBrowser = browser

  afterCurrentTest(async () => {
    await browser.close()
    if (previousBrowser === browser) {
      previousBrowser = null
    }
  })
  ;(global as any).browserName = browserOptions.browserName

  // TODO: `appPortOrUrl` can change if the next server is stopped and started again
  // some tests work around this:
  // - test/production/prerender-prefetch/index.test.ts
  // - test/development/app-dir/dev-indicator/hide-button.test.ts
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

  // This is a temporary workaround for turbopack starting watching too late.
  // So we delay file changes to give it some time
  // to connect the WebSocket and start watching.
  if (process.env.IS_TURBOPACK_TEST) {
    await waitFor(1000)
  }
  return browser
}
