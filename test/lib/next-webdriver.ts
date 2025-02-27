import { getFullUrl, waitFor } from 'next-test-utils'
import os from 'os'
import { BrowserInterface } from './browsers/base'

if (!process.env.TEST_FILE_PATH) {
  process.env.TEST_FILE_PATH = module.parent.filename
}

let deviceIP: string
const isBrowserStack = !!process.env.BROWSERSTACK
;(global as any).browserName = process.env.BROWSER_NAME || 'chrome'

if (isBrowserStack) {
  const nets = os.networkInterfaces()
  for (const key of Object.keys(nets)) {
    let done = false

    for (const item of nets[key]) {
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
   * disable cache for page load
   */
  disableCache?: boolean
  /**
   * the callback receiving page instance before loading page
   * @param page
   * @returns
   */
  beforePageLoad?: (page: any) => void
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
): Promise<BrowserInterface> {
  let CurrentInterface: new () => BrowserInterface

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
  } = options

  const { Playwright, quit } = await import('./browsers/playwright')
  CurrentInterface = Playwright
  browserQuit = quit

  const browser = new CurrentInterface()
  const browserName = process.env.BROWSER_NAME || 'chrome'
  await browser.setup(
    browserName,
    locale,
    !disableJavaScript,
    ignoreHTTPSErrors,
    // allow headless to be overwritten for a particular test
    typeof headless !== 'undefined' ? headless : !!process.env.HEADLESS
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
  })
  console.log(`\n> Loaded browser with ${fullUrl}\n`)

  browserTeardown.push(browser.close.bind(browser))

  // Wait for application to hydrate
  if (waitHydration) {
    console.log(`\n> Waiting hydration for ${fullUrl}\n`)

    const checkHydrated = async () => {
      await browser.evalAsync(function () {
        var callback = arguments[arguments.length - 1]

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
          var timeout = setTimeout(callback, 10 * 1000)
          ;(window as any).__NEXT_HYDRATED_CB = function () {
            clearTimeout(timeout)
            console.log('Next.js hydrate callback fired')
            callback()
          }
        }
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

    console.log(`\n> Hydration complete for ${fullUrl}\n`)
  }

  // This is a temporary workaround for turbopack starting watching too late.
  // So we delay file changes to give it some time
  // to connect the WebSocket and start watching.
  if (process.env.TURBOPACK) {
    await waitFor(1000)
  }
  return browser
}

export { BrowserInterface }
