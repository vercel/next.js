import { debugPrint, getFullUrl, waitFor } from 'next-test-utils'
import os from 'os'
import {
  Playwright,
  PlaywrightNavigationWaitUntil,
} from './browsers/playwright'
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

export interface WebdriverOptions {
  /**
   * whether to wait for React hydration to finish
   */
  waitHydration?: boolean
  /**
   * allow retrying hydration wait if reload occurs
   */
  retryWaitHydration?: boolean
  /**
   * The browser event to wait for during the initial page load. Passed through to `browser.loadPage`
   * */
  waitUntil?: PlaywrightNavigationWaitUntil
  /**
   * disable cache for page load
   */
  disableCache?: boolean
  /**
   * the callback receiving page instance before loading page
   * @param page
   * @returns
   */
  beforePageLoad?: (page: Page) => void | Promise<void>
  /**
   * @see {@link https://playwright.dev/docs/api/class-page#page-set-extra-http-headers Playwright.Page.setExtraHTTPHeaders}
   */
  extraHTTPHeaders?: Record<string, string>
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
}

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
    extraHTTPHeaders,
    locale,
    disableJavaScript,
    ignoreHTTPSErrors,
    headless,
    cpuThrottleRate,
    pushErrorAsConsoleLog,
    userAgent,
    waitUntil,
  } = options

  const { Playwright, quit } = await import('./browsers/playwright')
  browserQuit = quit

  const browser = new Playwright()
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

  debugPrint(`Loading browser with ${fullUrl}`)

  await browser.loadPage(fullUrl, {
    disableCache,
    cpuThrottleRate,
    beforePageLoad,
    extraHTTPHeaders,
    pushErrorAsConsoleLog,
    waitUntil,
  })
  debugPrint(`Loaded browser with ${fullUrl}`)

  browserTeardown.push(browser.close.bind(browser))

  // Wait for application to hydrate
  if (!disableJavaScript && waitHydration) {
    debugPrint(`Waiting hydration for ${fullUrl}`)

    const checkHydrated = async () => {
      await browser.eval(() => {
        return new Promise<void>((callback) => {
          // if it's not a Next.js app return
          if (
            !document.documentElement.innerHTML.includes('__NEXT_DATA__') &&
            // @ts-ignore next exists on window if it's a Next.js page.
            typeof ((window as any).next && (window as any).next.version) ===
              'undefined'
          ) {
            console.log('Not a next.js page, resolving hydrate check')
            callback()
          }

          // TODO: should we also ensure router.isReady is true
          // by default before resolving?
          if ((window as any).__NEXT_HYDRATED) {
            console.log('Next.js page already hydrated')
            callback()
          } else {
            let timeout = setTimeout(callback, 10 * 1000)
            ;(window as any).__NEXT_HYDRATED_CB = function () {
              clearTimeout(timeout)
              console.log('Next.js hydrate callback fired')
              callback()
            }
          }
        })
      })
    }

    try {
      await checkHydrated()
    } catch (err) {
      if (retryWaitHydration) {
        // re-try in case the page reloaded during check
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await checkHydrated()
      } else {
        console.error('failed to check hydration')
        throw err
      }
    }

    debugPrint(`Hydration complete for ${fullUrl}`)
  }

  // This is a temporary workaround for turbopack starting watching too late.
  // So we delay file changes to give it some time
  // to connect the WebSocket and start watching.
  // TODO: Is this still needed? Can we wait in a more useful way, like a socket connection event?
  if (process.env.IS_TURBOPACK_TEST && process.env.TURBOPACK_DEV) {
    debugPrint(`Waiting for for turbopack watcher to start`)
    await waitFor(1000)
  }
  return browser
}
