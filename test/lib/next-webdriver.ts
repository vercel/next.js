import { debugPrint, getFullUrl } from 'next-test-utils'
import os from 'os'
import {
  Permissions,
  Playwright,
  PlaywrightNavigationWaitUntil,
  getDeviceOptionsByName,
  launchBrowserProcess,
} from './browsers/playwright'
import { Page, Browser } from 'playwright'

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

let browserProcesses = new Map<string, Browser>()

async function launchOrReuseBrowserProcess(
  ...args: Parameters<typeof launchBrowserProcess>
) {
  const key = JSON.stringify(args)
  let browserProcess = browserProcesses.get(key)
  if (!browserProcess) {
    browserProcess = await launchBrowserProcess(...args)
    browserProcesses.set(key, browserProcess)
  }
  return browserProcess
}

async function closeActiveBrowserProcesses() {
  const currentBrowserProcesses = browserProcesses
  browserProcesses = new Map()

  await Promise.all(
    [...currentBrowserProcesses.values()].map((browserProcess) =>
      browserProcess
        .close()
        .catch((err) =>
          console.error('error while closing browser process:', err)
        )
    )
  )
}

/**
 * Despite generally calling them "browsers" (as per `next.browser()`),
 * these really correspond to playwright's "browser contexts".
 * We can create multiple browser contexts in the same browser process
 * (generally one per test), but the browser process is generally shared across
 * the whole test suite (unless some options result in us creating a second one)
 */
let browserInstances = new Set<Playwright>()

async function closeActiveBrowserInstances() {
  const currentPlaywrightInstances = browserInstances
  browserInstances = new Set()

  await Promise.all(
    [...currentPlaywrightInstances].map((browser) =>
      browser
        .destroy()
        .catch((err) => console.error('error while destroying browser:', err))
    )
  )
}

if (typeof afterAll === 'function') {
  afterAll(async () => {
    await closeActiveBrowserProcesses()
  })
}

if (typeof afterEach === 'function') {
  afterEach(async () => {
    await closeActiveBrowserInstances()
  })
}

export interface WebdriverOptions {
  permissions?: Permissions
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

  /**
   * Override the base URL/port that `url` is resolved against. Useful when the
   * test needs to drive a proxy or a separate server in front of Next.js.
   */
  baseUrl?: string | number
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
  options: WebdriverOptions = {}
): Promise<Playwright> {
  const {
    waitHydration = true,
    retryWaitHydration = false,
    disableCache = false,
    beforePageLoad,
    extraHTTPHeaders,
    locale,
    disableJavaScript,
    permissions,
    ignoreHTTPSErrors,
    headless = !!process.env.HEADLESS,
    cpuThrottleRate,
    pushErrorAsConsoleLog,
    userAgent,
    waitUntil,
    baseUrl,
  } = options
  if (baseUrl !== undefined) {
    appPortOrUrl = baseUrl
  }

  const browserName = process.env.BROWSER_NAME || 'chrome'
  // Some tests rely on this being set
  ;(global as any).browserName = browserName

  const deviceName = process.env.DEVICE_NAME

  const browserProcess = await launchOrReuseBrowserProcess(browserName, {
    headless,
  })

  const deviceOptions = getDeviceOptionsByName(deviceName)
  const browser = await Playwright.create(browserProcess, {
    locale: locale!,
    javaScriptEnabled: !disableJavaScript,
    ignoreHTTPSErrors: Boolean(ignoreHTTPSErrors),
    userAgent,
    permissions,
    ...deviceOptions,
  })
  browserInstances.add(browser)

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

  return browser
}
