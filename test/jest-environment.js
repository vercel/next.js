// my-custom-environment
const wd = require('wd')
const os = require('os')
const http = require('http')
const fetch = require('node-fetch')
const getPort = require('get-port')
const NodeEnvironment = require('jest-environment-node')
const {
  BROWSER_NAME,
  BROWSERSTACK,
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY
} = process.env

let browser
let initialWindow
let browserOptions = {
  browserName: BROWSER_NAME || 'chrome'
}
let deviceIP = 'localhost'

const isIE = BROWSER_NAME === 'ie'
const isSafari = BROWSER_NAME === 'safari'
const isFirefox = BROWSER_NAME === 'firefox'
// 30 seconds for BrowserStack 5 seconds for local
const isBrowserStack = BROWSERSTACK && BROWSERSTACK_USERNAME && BROWSERSTACK_ACCESS_KEY
const browserTimeout = (isBrowserStack ? 30 : 5) * 1000

if (isBrowserStack) {
  const safariOpts = {
    'os': 'OS X',
    'os_version': 'Mojave',
    'browser': 'Safari'
  }
  const ieOpts = {
    'os': 'Windows',
    'os_version': '10',
    'browser': 'IE'
  }
  const firefoxOpts = {
    'os': 'Windows',
    'os_version': '10',
    'browser': 'Firefox'
  }
  const sharedOpts = {
    'browserstack.local': true,
    'browserstack.video': false
  }

  browserOptions = {
    ...browserOptions,
    ...sharedOpts,

    ...(isIE ? ieOpts : {}),
    ...(isSafari ? safariOpts : {}),
    ...(isFirefox ? firefoxOpts : {})
  }
}

const newTabPg = `
<!DOCTYPE html>
<html>
  <head>
    <title>new tab</title>
  </head>
  <body>
    <a href="about:blank" target="_blank" id="new">Click me</a>
  </body>
</html>
`

class CustomEnvironment extends NodeEnvironment {
  async createBrowser () {
    // always create new browser session if not BrowserStack
    if ((!browser && isBrowserStack)) {
      browser = wd.promiseChainRemote(
        'hub-cloud.browserstack.com', // seleniumHost
        80, // seleniumPort
        BROWSERSTACK_USERNAME,
        BROWSERSTACK_ACCESS_KEY
      )

      // Setup the browser instance
      await browser.init(browserOptions)
      initialWindow = await browser.windowHandle()
      global.bsBrowser = browser
    }

    if (isBrowserStack) {
      // disable browser.close and we handle it manually
      browser.origClose = browser.close
      browser.close = () => {}
      // Since ie11 doesn't like dataURIs we have to spin up a
      // server to handle the new tab page
      this.server = http.createServer((req, res) => {
        res.statusCode = 200
        res.end(newTabPg)
      })
      this.newTabPort = await getPort()
      await new Promise((resolve, reject) => {
        this.server.listen(this.newTabPort, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })

      const networkIntfs = os.networkInterfaces()
      // find deviceIP to use with BrowserStack
      for (const intf of Object.keys(networkIntfs)) {
        const addresses = networkIntfs[intf]

        for (const { internal, address, family } of addresses) {
          if (family !== 'IPv4' || internal) continue
          try {
            const res = await fetch(`http://${address}:${this.newTabPort}`)
            if (res.ok) {
              deviceIP = address
              break
            }
          } catch (_) {}
        }
      }
    }
    this.global.browserName = BROWSER_NAME
    this.global.isBrowserStack = isBrowserStack
    // Mock current browser set up
    this.global.bsWd = async (appPort, pathname) => {
      const url = `http://${deviceIP}:${appPort}${pathname}`
      console.log(`\n> Loading browser with ${url}\n`)
      if (isBrowserStack) await this.freshWindow()

      return new Promise((resolve, reject) => {
        let timedOut = false
        const timeoutHandler = setTimeout(() => {
          timedOut = true
          reject(new Error(`Loading browser with ${url} timed out`))
        }, browserTimeout)

        browser.get(url, err => {
          if (err) return reject(err)
          clearTimeout(timeoutHandler)
          if (!timedOut) resolve(browser)
        })
      })
    }
  }

  async freshWindow (tries = 0) {
    if (tries > 3) throw new Error('failed to get fresh browser window')
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
    const newTabUrl = `http://${deviceIP}:${this.newTabPort}/`

    // load html to open new tab
    if (await browser.url() !== newTabUrl) {
      await browser.get(newTabUrl)
    }
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
    if (this.server) this.server.close()
  }
}

module.exports = CustomEnvironment
