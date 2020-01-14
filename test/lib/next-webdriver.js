import os from 'os'
import path from 'path'
import fetch from 'node-fetch'
import { until, Builder, By } from 'selenium-webdriver'
import { Options as ChromeOptions } from 'selenium-webdriver/chrome'
import { Options as SafariOptions } from 'selenium-webdriver/safari'
import { Options as FireFoxOptions } from 'selenium-webdriver/firefox'

const {
  BROWSER_NAME: browserName = 'chrome',
  BROWSERSTACK,
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY,
  HEADLESS,
  CHROME_BIN,
} = process.env

let capabilities = {}

const isChrome = browserName === 'chrome'
const isSafari = browserName === 'safari'
const isFirefox = browserName === 'firefox'
const isIE = browserName === 'internet explorer'

if (process.env.ChromeWebDriver) {
  process.env.PATH = `${process.env.ChromeWebDriver}${path.delimiter}${process.env.PATH}`
}

const isBrowserStack =
  BROWSERSTACK && BROWSERSTACK_USERNAME && BROWSERSTACK_ACCESS_KEY

if (isBrowserStack) {
  const safariOpts = {
    os: 'OS X',
    os_version: 'Mojave',
    browser: 'Safari',
  }
  const ieOpts = {
    os: 'Windows',
    os_version: '10',
    browser: 'IE',
  }
  const firefoxOpts = {
    os: 'Windows',
    os_version: '10',
    browser: 'Firefox',
  }
  const sharedOpts = {
    'browserstack.local': true,
    'browserstack.video': false,
    'browserstack.user': BROWSERSTACK_USERNAME,
    'browserstack.key': BROWSERSTACK_ACCESS_KEY,
    'browserstack.localIdentifier': global.browserStackLocalId,
  }

  capabilities = {
    ...capabilities,
    ...sharedOpts,

    ...(isIE ? ieOpts : {}),
    ...(isSafari ? safariOpts : {}),
    ...(isFirefox ? firefoxOpts : {}),
  }
}

let chromeOptions = new ChromeOptions()
let firefoxOptions = new FireFoxOptions()
let safariOptions = new SafariOptions()

if (HEADLESS) {
  const screenSize = { width: 1280, height: 720 }
  chromeOptions = chromeOptions.headless().windowSize(screenSize)
  firefoxOptions = firefoxOptions.headless().windowSize(screenSize)
}

if (CHROME_BIN) {
  chromeOptions = chromeOptions.setChromeBinaryPath(path.resolve(CHROME_BIN))
}

let seleniumServer

if (isBrowserStack) {
  seleniumServer = 'http://hub-cloud.browserstack.com/wd/hub'
} else if (global.seleniumServerPort) {
  seleniumServer = `http://localhost:${global.seleniumServerPort}/wd/hub`
}

let browser = new Builder()
  .usingServer(seleniumServer)
  .withCapabilities(capabilities)
  .forBrowser(browserName)
  .setChromeOptions(chromeOptions)
  .setFirefoxOptions(firefoxOptions)
  .setSafariOptions(safariOptions)
  .build()

global.wd = browser

/*
  # Methods to match

  - elementByCss
  - elementsByCss
  - waitForElementByCss
  - elementByCss.text
  - elementByCss.click
*/

let initialWindow
let deviceIP = 'localhost'

const getDeviceIP = async () => {
  const networkIntfs = os.networkInterfaces()
  // find deviceIP to use with BrowserStack
  for (const intf of Object.keys(networkIntfs)) {
    const addresses = networkIntfs[intf]

    for (const { internal, address, family } of addresses) {
      if (family !== 'IPv4' || internal) continue
      try {
        const res = await fetch(`http://${address}:${global._newTabPort}`)
        if (res.ok) {
          deviceIP = address
          break
        }
      } catch (_) {}
    }
  }
}

// eslint-disable-next-line no-unused-vars
const freshWindow = async () => {
  // First we close all extra windows left over
  let allWindows = await browser.getAllWindowHandles()

  for (const win of allWindows) {
    if (win === initialWindow) continue
    try {
      await browser.switchTo().window(win)
      await browser.close()
    } catch (_) {}
  }
  await browser.switchTo().window(initialWindow)

  // now we open a fresh window
  await browser.get(`http://${deviceIP}:${global._newTabPort}`)

  const newTabLink = await browser.findElement(By.css('#new'))
  await newTabLink.click()

  allWindows = await browser.getAllWindowHandles()
  const newWindow = allWindows.find(win => win !== initialWindow)
  await browser.switchTo().window(newWindow)
}

export default async (appPort, path) => {
  if (!initialWindow) {
    initialWindow = await browser.getWindowHandle()
  }
  if (isBrowserStack && deviceIP === 'localhost') {
    await getDeviceIP()
  }
  // browser.switchTo().window() fails with `missing field `handle``
  // in safari and firefox so disabling freshWindow since our
  // tests shouldn't rely on it
  if (isChrome) {
    await freshWindow()
  }

  const url = `http://${deviceIP}:${appPort}${path}`
  console.log(`\n> Loading browser with ${url}\n`)

  await browser.get(url)
  console.log(`\n> Loaded browser with ${url}\n`)

  class Chain {
    updateChain(nextCall) {
      if (!this.promise) {
        this.promise = Promise.resolve()
      }
      this.promise = this.promise.then(nextCall)
      this.then = cb => this.promise.then(cb)
      this.catch = cb => this.promise.catch(cb)
      this.finally = cb => this.promise.finally(cb)
      return this
    }

    elementByCss(sel) {
      return this.updateChain(() =>
        browser.findElement(By.css(sel)).then(el => {
          el.sel = sel
          el.text = () => el.getText()
          el.getComputedCss = prop => el.getCssValue(prop)
          el.type = text => el.sendKeys(text)
          el.getValue = () =>
            browser.executeScript(
              `return document.querySelector('${sel}').value`
            )
          return el
        })
      )
    }

    elementById(sel) {
      return this.elementByCss(`#${sel}`)
    }

    getValue() {
      return this.updateChain(el =>
        browser.executeScript(
          `return document.querySelector('${el.sel}').value`
        )
      )
    }

    text() {
      return this.updateChain(el => el.getText())
    }

    type(text) {
      return this.updateChain(el => el.sendKeys(text))
    }

    moveTo() {
      return this.updateChain(el => {
        return browser
          .actions()
          .move({ origin: el })
          .perform()
          .then(() => el)
      })
    }

    getComputedCss(prop) {
      return this.updateChain(el => {
        return el.getCssValue(prop)
      })
    }

    getAttribute(attr) {
      return this.updateChain(el => el.getAttribute(attr))
    }

    hasElementByCssSelector(sel) {
      return this.eval(`document.querySelector('${sel}')`)
    }

    click() {
      return this.updateChain(el => {
        return el.click().then(() => el)
      })
    }

    elementsByCss(sel) {
      return this.updateChain(() => browser.findElements(By.css(sel)))
    }

    waitForElementByCss(sel, timeout) {
      return this.updateChain(() =>
        browser.wait(until.elementLocated(By.css(sel), timeout))
      )
    }

    eval(snippet) {
      if (typeof snippet === 'string' && !snippet.startsWith('return')) {
        snippet = `return ${snippet}`
      }
      return this.updateChain(() => browser.executeScript(snippet))
    }

    log(type) {
      return this.updateChain(() =>
        browser
          .manage()
          .logs()
          .get(type)
      )
    }

    url() {
      return this.updateChain(() => browser.getCurrentUrl())
    }

    back() {
      return this.updateChain(() => browser.navigate().back())
    }

    forward() {
      return this.updateChain(() => browser.navigate().forward())
    }

    refresh() {
      return this.updateChain(() => browser.navigate().refresh())
    }

    close() {
      return this.updateChain(() => Promise.resolve())
    }
    quit() {
      return this.close()
    }
  }

  const promiseProp = new Set(['then', 'catch', 'finally'])

  return new Proxy(new Chain(), {
    get(obj, prop) {
      if (obj[prop] || promiseProp.has(prop)) {
        return obj[prop]
      }
      return browser[prop]
    },
  })
}
