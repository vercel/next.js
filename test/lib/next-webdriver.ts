import os from 'os'
import { BrowserInterface } from './browsers/base'

let deviceIP: string
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

let browserQuit

if (typeof afterAll === 'function') {
  afterAll(async () => {
    if (browserQuit) {
      await browserQuit()
    }
  })
}

;(global as any).browserName = process.env.BROWSER_NAME || 'chrome'

export default async function webdriver(
  appPort: string | number,
  url: string,
  waitHydration = true,
  retryWaitHydration = false,
  requiresNewPage = false
): Promise<BrowserInterface> {
  let CurrentInterface: typeof BrowserInterface
  const isBrowserStack = !!process.env.BROWSERSTACK

  // we import only the needed interface
  if (
    process.env.CHROME_BIN ||
    process.env.BROWSERSTACK ||
    process.env.LEGACY_SAFARI ||
    process.env.BROWSER_NAME === 'internet explorer' ||
    process.env.SKIP_LOCAL_SELENIUM_SERVER
  ) {
    const browserMod = require('./browsers/selenium')
    CurrentInterface = browserMod.default
    browserQuit = browserMod.quit
  } else {
    const browserMod = require('./browsers/playwright')
    CurrentInterface = browserMod.default
    browserQuit = browserMod.quit
  }

  const browser = new CurrentInterface()
  await browser.setup(process.env.BROWSER_NAME || 'chrome')

  const fullUrl = `http://${
    isBrowserStack ? deviceIP : 'localhost'
  }:${appPort}${url}`

  console.log(`\n> Loading browser with ${url}\n`)

  await browser.loadPage(fullUrl, requiresNewPage)
  console.log(`\n> Loaded browser with ${url}\n`)

  // Wait for application to hydrate
  if (waitHydration) {
    console.log(`\n> Waiting hydration for ${url}\n`)

    const checkHydrated = async () => {
      await browser.evalAsync(function () {
        var callback = arguments[arguments.length - 1]

        // if it's not a Next.js app return
        if (
          document.documentElement.innerHTML.indexOf('__NEXT_DATA__') === -1
        ) {
          callback()
        }

        if ((window as any).__NEXT_HYDRATED) {
          callback()
        } else {
          var timeout = setTimeout(callback, 10 * 1000)
          ;(window as any).__NEXT_HYDRATED_CB = function () {
            clearTimeout(timeout)
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

    console.log(`\n> Hydration complete for ${url}\n`)
  }
  return browser
}
