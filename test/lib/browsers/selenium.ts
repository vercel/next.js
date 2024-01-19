import path from 'path'
import resolveFrom from 'resolve-from'
import { execSync } from 'child_process'
import { Options as ChromeOptions } from 'selenium-webdriver/chrome'
import { Options as SafariOptions } from 'selenium-webdriver/safari'
import { Options as FireFoxOptions } from 'selenium-webdriver/firefox'
import { Builder, By, ThenableWebDriver, until } from 'selenium-webdriver'

import { BrowserInterface } from './base'

const {
  BROWSERSTACK,
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY,
  CHROME_BIN,
  LEGACY_SAFARI,
  SKIP_LOCAL_SELENIUM_SERVER,
} = process.env

if (process.env.ChromeWebDriver) {
  process.env.PATH = `${process.env.ChromeWebDriver}${path.delimiter}${process.env.PATH}`
}

let seleniumServer: any
let browserStackLocal: any
let browser: ThenableWebDriver

export async function quit() {
  await Promise.all([
    browser?.quit(),
    new Promise<void>((resolve) => {
      browserStackLocal
        ? browserStackLocal.killAllProcesses(() => resolve())
        : resolve()
    }),
  ])
  seleniumServer?.kill()

  browser = undefined
  browserStackLocal = undefined
  seleniumServer = undefined
}

export class Selenium extends BrowserInterface {
  private browserName: string

  // TODO: support setting locale
  async setup(
    browserName: string,
    locale: string,
    javaScriptEnabled: boolean,
    headless: boolean
  ) {
    if (browser) return
    this.browserName = browserName

    let capabilities = {}
    const isSafari = browserName === 'safari'
    const isFirefox = browserName === 'firefox'
    const isIE = browserName === 'internet explorer'
    const isBrowserStack = BROWSERSTACK
    const localSeleniumServer = SKIP_LOCAL_SELENIUM_SERVER !== 'true'

    // install conditional packages globally so the entire
    // monorepo doesn't need to rebuild when testing
    let globalNodeModules: string

    if (isBrowserStack || localSeleniumServer) {
      globalNodeModules = execSync('npm root -g').toString().trim()
    }

    if (isBrowserStack) {
      const { Local } = require(resolveFrom(
        globalNodeModules,
        'browserstack-local'
      ))
      browserStackLocal = new Local()

      const localBrowserStackOpts = {
        key: process.env.BROWSERSTACK_ACCESS_KEY,
        // Add a unique local identifier to run parallel tests
        // on BrowserStack
        localIdentifier: new Date().getTime(),
      }
      await new Promise<void>((resolve, reject) => {
        browserStackLocal.start(localBrowserStackOpts, (err) => {
          if (err) return reject(err)
          console.log(
            'Started BrowserStackLocal',
            browserStackLocal.isRunning()
          )
          resolve()
        })
      })

      const safariOpts = {
        os: 'OS X',
        os_version: 'Mojave',
        browser: 'Safari',
      }
      const safariLegacyOpts = {
        os: 'OS X',
        os_version: 'Sierra',
        browserName: 'Safari',
        browser_version: '10.1',
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
        'browserstack.localIdentifier': localBrowserStackOpts.localIdentifier,
      }

      capabilities = {
        ...capabilities,
        ...sharedOpts,

        ...(isIE ? ieOpts : {}),
        ...(isSafari ? (LEGACY_SAFARI ? safariLegacyOpts : safariOpts) : {}),
        ...(isFirefox ? firefoxOpts : {}),
      }
    } else if (localSeleniumServer) {
      console.log('Installing selenium server')
      const seleniumServerMod = require(resolveFrom(
        globalNodeModules,
        'selenium-standalone'
      ))

      await new Promise<void>((resolve, reject) => {
        seleniumServerMod.install((err) => {
          if (err) return reject(err)
          resolve()
        })
      })

      console.log('Starting selenium server')
      await new Promise<void>((resolve, reject) => {
        seleniumServerMod.start((err, child) => {
          if (err) return reject(err)
          seleniumServer = child
          resolve()
        })
      })
      console.log('Started selenium server')
    }

    let chromeOptions = new ChromeOptions()
    let firefoxOptions = new FireFoxOptions()
    let safariOptions = new SafariOptions()

    if (headless) {
      const screenSize = { width: 1280, height: 720 }
      chromeOptions = chromeOptions.headless().windowSize(screenSize) as any
      firefoxOptions = firefoxOptions.headless().windowSize(screenSize)
    }

    if (CHROME_BIN) {
      chromeOptions = chromeOptions.setChromeBinaryPath(
        path.resolve(CHROME_BIN)
      )
    }

    let seleniumServerUrl

    if (isBrowserStack) {
      seleniumServerUrl = 'http://hub-cloud.browserstack.com/wd/hub'
    } else if (localSeleniumServer) {
      seleniumServerUrl = `http://localhost:4444/wd/hub`
    }

    browser = new Builder()
      .usingServer(seleniumServerUrl)
      .withCapabilities(capabilities)
      .forBrowser(browserName)
      .setChromeOptions(chromeOptions)
      .setFirefoxOptions(firefoxOptions)
      .setSafariOptions(safariOptions)
      .build()
  }

  async get(url: string): Promise<void> {
    return browser.get(url)
  }

  async loadPage(url: string) {
    // in chrome we use a new tab for testing
    if (this.browserName === 'chrome') {
      const initialHandle = await browser.getWindowHandle()

      await browser.switchTo().newWindow('tab')
      const newHandle = await browser.getWindowHandle()

      await browser.switchTo().window(initialHandle)
      await browser.close()
      await browser.switchTo().window(newHandle)

      // clean-up extra windows created from links and such
      for (const handle of await browser.getAllWindowHandles()) {
        if (handle !== newHandle) {
          await browser.switchTo().window(handle)
          await browser.close()
        }
      }
      await browser.switchTo().window(newHandle)
    } else {
      await browser.get('about:blank')
    }
    return browser.get(url)
  }

  back(): BrowserInterface {
    return this.chain(() => {
      return browser.navigate().back()
    })
  }
  forward(): BrowserInterface {
    return this.chain(() => {
      return browser.navigate().forward()
    })
  }
  refresh(): BrowserInterface {
    return this.chain(() => {
      return browser.navigate().refresh()
    })
  }
  setDimensions({
    width,
    height,
  }: {
    height: number
    width: number
  }): BrowserInterface {
    return this.chain(() =>
      browser.manage().window().setRect({ width, height, x: 0, y: 0 })
    )
  }
  addCookie(opts: { name: string; value: string }): BrowserInterface {
    return this.chain(() => browser.manage().addCookie(opts))
  }
  deleteCookies(): BrowserInterface {
    return this.chain(() => browser.manage().deleteAllCookies())
  }

  elementByCss(selector: string) {
    return this.chain(() => {
      return browser.findElement(By.css(selector)).then((el: any) => {
        el.selector = selector
        el.text = () => el.getText()
        el.getComputedCss = (prop) => el.getCssValue(prop)
        el.type = (text) => el.sendKeys(text)
        el.getValue = () =>
          browser.executeScript(
            `return document.querySelector('${selector}').value`
          )
        return el
      })
    })
  }

  elementById(sel) {
    return this.elementByCss(`#${sel}`)
  }

  getValue() {
    return this.chain((el) =>
      browser.executeScript(
        `return document.querySelector('${el.selector}').value`
      )
    ) as any
  }

  text() {
    return this.chain((el) => el.getText()) as any
  }

  type(text) {
    return this.chain((el) => el.sendKeys(text))
  }

  moveTo() {
    return this.chain((el) => {
      return browser
        .actions()
        .move({ origin: el })
        .perform()
        .then(() => el)
    })
  }

  async getComputedCss(prop: string) {
    return this.chain((el) => {
      return el.getCssValue(prop)
    }) as any
  }

  async getAttribute<T = any>(attr) {
    return this.chain((el) => el.getAttribute(attr)) as T
  }

  async hasElementByCssSelector(selector: string) {
    return this.eval(`!!document.querySelector('${selector}')`) as any
  }

  click() {
    return this.chain((el) => {
      return el.click().then(() => el)
    })
  }

  elementsByCss(sel) {
    return this.chain(() =>
      browser.findElements(By.css(sel))
    ) as any as BrowserInterface[]
  }

  waitForElementByCss(sel, timeout) {
    return this.chain(() =>
      browser.wait(until.elementLocated(By.css(sel)), timeout)
    )
  }

  waitForCondition(condition, timeout) {
    return this.chain(() =>
      browser.wait(async (driver) => {
        return driver.executeScript('return ' + condition).catch(() => false)
      }, timeout)
    )
  }

  async eval<T = any>(snippet) {
    if (typeof snippet === 'string' && !snippet.startsWith('return')) {
      snippet = `return ${snippet}`
    }
    return browser.executeScript<T>(snippet)
  }

  async evalAsync<T = any>(snippet) {
    if (typeof snippet === 'string' && !snippet.startsWith('return')) {
      snippet = `return ${snippet}`
    }
    return browser.executeAsyncScript<T>(snippet)
  }

  async log() {
    return this.chain(() => browser.manage().logs().get('browser')) as any
  }

  async url() {
    return this.chain(() => browser.getCurrentUrl()) as any
  }
}
