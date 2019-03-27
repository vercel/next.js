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
let initialWindow
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
      initialWindow = await browser.windowHandle()

      browser.origClose = browser.close
      // disable browser.close and we handle it manually
      browser.close = () => {}
    }

    // Mock current browser set up
    this.global.webdriver = async (appPort, pathname) => {
      const url = `http://localhost:${appPort}${pathname}`

      console.log(`\n> Loading browser with ${url}\n`)
      await this.freshWindow()

      return new Promise(async (resolve, reject) => {
        let timedOut = false
        const timeoutHandler = setTimeout(() => {
          timedOut = true
          reject(new Error(`Loading browser with ${url} timed out`))
        }, browserTimeout)

        await browser.get(url)
        clearTimeout(timeoutHandler)
        if (!timedOut) resolve(browser)
      })
    }
  }

  async freshWindow (tries = 0) {
    if (tries > 4) throw new Error('failed to get fresh browser window')
    // Since we need a fresh start for each window
    // we have to force a new tab which can be disposed
    const startWindows = await browser.windowHandles()

    // let's close all windows that aren't the initial window
    for (const window of startWindows) {
      if (!window || window === initialWindow) continue
      try {
        await browser.window(window)
        await browser.origClose()
      } catch (_) { /* should already be closed */ }
    }
    // focus initial window
    await browser.window(initialWindow)
    // load html to open new tab
    await browser.get('data:text/html;charset=utf-8,<%21DOCTYPE%20html><html><head><title>new%20tab<%2Ftitle><%2Fhead><body><a%20href%3D"about%3Ablank"%20target%3D"_blank"%20id%3D"new">Click%20me<%2Fa><%2Fbody><%2Fhtml>')
    // click new tab link
    await browser.elementByCss('#new').click()
    // focus fresh window
    const newWindows = await browser.windowHandles()
    try {
      await browser.window(
        newWindows.find(win => {
          if (win &&
            win !== initialWindow &&
            startWindows.indexOf(win) < 0
          ) {
            return win
          }
        })
      )
    } catch (err) {
      await this.freshWindow(tries + 1)
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
