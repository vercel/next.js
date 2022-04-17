import { getFullUrl } from 'next-test-utils'
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

let browserQuit

if (typeof afterAll === 'function') {
  afterAll(async () => {
    if (browserQuit) {
      await browserQuit()
    }
  })
}

export const USE_SELENIUM = Boolean(
  process.env.LEGACY_SAFARI ||
    process.env.BROWSER_NAME === 'internet explorer' ||
    process.env.SKIP_LOCAL_SELENIUM_SERVER
)

/**
 *
 * @param appPort can either be the port or the full URL
 * @param url the path/query to append when using appPort
 * @param options.waitHydration whether to wait for react hydration to finish
 * @param options.retryWaitHydration allow retrying hydration wait if reload occurs
 * @param options.disableCache disable cache for page load
 * @param options.beforePageLoad the callback receiving page instance before loading page
 * @returns thenable browser instance
 */
export default async function webdriver(
  appPortOrUrl: string | number,
  url: string,
  options?: {
    waitHydration?: boolean
    retryWaitHydration?: boolean
    disableCache?: boolean
    beforePageLoad?: (page: any) => void
    locale?: string
  }
): Promise<BrowserInterface> {
  let CurrentInterface: typeof BrowserInterface

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
  } = options

  // we import only the needed interface
  if (USE_SELENIUM) {
    const browserMod = require('./browsers/selenium')
    CurrentInterface = browserMod.default
    browserQuit = browserMod.quit
  } else {
    const browserMod = require('./browsers/playwright')
    CurrentInterface = browserMod.default
    browserQuit = browserMod.quit
  }

  const browser = new CurrentInterface()
  const browserName = process.env.BROWSER_NAME || 'chrome'
  await browser.setup(browserName, locale)
  ;(global as any).browserName = browserName

  const fullUrl = getFullUrl(
    appPortOrUrl,
    url,
    isBrowserStack ? deviceIP : 'localhost'
  )

  console.log(`\n> Loading browser with ${fullUrl}\n`)

  await browser.loadPage(fullUrl, { disableCache, beforePageLoad })
  console.log(`\n> Loaded browser with ${fullUrl}\n`)

  // Wait for application to hydrate
  if (waitHydration) {
    console.log(`\n> Waiting hydration for ${fullUrl}\n`)

    const checkHydrated = async () => {
      await browser.evalAsync(function () {
        var callback = arguments[arguments.length - 1]

        // if it's not a Next.js app return
        if (
          document.documentElement.innerHTML.indexOf('__NEXT_DATA__') === -1
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
  return browser
}
