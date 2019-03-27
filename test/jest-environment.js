// my-custom-environment
const wd = require('wd')
const NodeEnvironment = require('jest-environment-node')
const {
  HEADLESS,
  BROWSER_NAME,
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY
} = process.env

let browser
let driverPort = 9515
let browserOptions = {
  browserName: BROWSER_NAME || 'chrome'
}
// 30 seconds for BrowserStack 5 seconds for local
const isBrowserStack = BROWSERSTACK_USERNAME && BROWSERSTACK_ACCESS_KEY
const browserTimeout = (isBrowserStack ? 30 : 5) * 1000

if (isBrowserStack) {
  browserOptions = {
    ...browserOptions,
    'browserstack.local': true,
    'browserstack.video': false
  }
} else if (HEADLESS !== 'false') {
  browserOptions.chromeOptions = { args: ['--headless'] }
}

class CustomEnvironment extends NodeEnvironment {
  async createBrowser () {
    if (!browser) {
      browser = isBrowserStack
        ? wd.promiseChainRemote(
          'hub-cloud.browserstack.com', // seleniumHost
          80, // seleniumPort
          BROWSERSTACK_USERNAME,
          BROWSERSTACK_ACCESS_KEY
        )
        : wd.promiseChainRemote(`http://localhost:${driverPort}/`)

      // Setup the browser instance
      await browser.init(browserOptions)
    }

    // Mock current browser set up
    this.global.webdriver = (appPort, pathname) => {
      return new Promise(async (resolve, reject) => {
        const url = `http://localhost:${appPort}${pathname}`

        // Since we need a fresh start for each window
        // we have to force a new tab which can be disposed
        let windows = await browser.windowHandles()
        await browser.window(windows[0])

        await browser.get('data:text/html;charset=utf-8,<%21DOCTYPE%20html><html><head><title>new%20tab<%2Ftitle><%2Fhead><body><a%20href%3D"about%3Ablank"%20target%3D"_blank"%20id%3D"new">Click%20me<%2Fa><%2Fbody><%2Fhtml>')
        await browser.elementByCss('#new').click()

        windows = await browser.windowHandles()
        await browser.window(windows[windows.length - 1])

        let timedOut = false

        const timeoutHandler = setTimeout(() => {
          timedOut = true
          reject(new Error(`Loading browser with ${url} timed out`))
        }, browserTimeout)

        browser.get(url, err => {
          if (timedOut) return
          clearTimeout(timeoutHandler)
          if (err) return reject(err)
          resolve(browser)
        })
      })
    }
  }

  async setup () {
    await super.setup()
    await this.createBrowser()
  }

  async teardown () {
    await super.teardown()
  }
}

module.exports = CustomEnvironment
