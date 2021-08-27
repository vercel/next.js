import { BrowserInterface } from './base'
import {
  chromium,
  webkit,
  firefox,
  Browser,
  BrowserContext,
  Page,
  ElementHandle,
} from 'playwright-chromium'

let page: Page
let browser: Browser
let context: BrowserContext
let pageLogs: Array<{ source: string; message: string }> = []

export async function quit() {
  await context?.close()
  await browser?.close()
  context = undefined
  browser = undefined
}

class Playwright extends BrowserInterface {
  private browserName: string

  async setup(browserName: string) {
    this.browserName = browserName
    const headless = !!process.env.HEADLESS

    if (browserName === 'safari') {
      browser = await webkit.launch({ headless })
    } else if (browserName === 'firefox') {
      browser = await firefox.launch({ headless })
    } else {
      browser = await chromium.launch({ headless })
    }
  }

  async get(url: string): Promise<void> {
    return page.goto(url) as any
  }

  async loadPage(url: string, newPage?: boolean) {
    if (context) {
      await context.close()
      context = undefined
    }
    context = await browser.newContext()
    page = await context.newPage()
    pageLogs = []

    page.on('console', (msg) => {
      pageLogs.push({ source: msg.type(), message: msg.text() })
    })
    return page.goto(url)
  }

  back(): BrowserInterface {
    return this.chain(() => {
      return page.goBack()
    })
  }
  forward(): BrowserInterface {
    return this.chain(() => {
      return page.goForward()
    })
  }
  refresh(): BrowserInterface {
    return this.chain(() => {
      return page.reload()
    })
  }
  setDimensions({
    width,
    height,
  }: {
    height: number
    width: number
  }): BrowserInterface {
    return this.chain(() => page.setViewportSize({ width, height }))
  }
  addCookie(opts: { name: string; value: string }): BrowserInterface {
    return this.chain(() => context.addCookies([opts]))
  }
  deleteCookie(name: string): BrowserInterface {
    return this.chain(() => context.addCookies([{ name, value: '' }]))
  }

  private wrapElement(el: ElementHandle, selector: string) {
    ;(el as any).selector = selector
    ;(el as any).text = () => el.innerText()
    ;(el as any).getComputedCss = (prop) =>
      page.evaluate(
        function (args) {
          return (
            getComputedStyle(document.querySelector(args.selector))[
              args.prop
            ] || null
          )
        },
        { selector, prop }
      )
    ;(el as any).getCssValue = (el as any).getComputedCss
    ;(el as any).getValue = () =>
      page.evaluate(
        function (args) {
          return (document.querySelector(args.selector) as any).value
        },
        { selector }
      )
    return el
  }

  elementByCss(selector: string) {
    return this.chain(() =>
      page.$(selector).then((el) => this.wrapElement(el, selector))
    )
  }

  elementById(sel) {
    return this.elementByCss(`#${sel}`)
  }

  getValue() {
    return this.chain((el) =>
      page.evaluate(
        function (args) {
          return document.querySelector(args.selector).value
        },
        { selector: el.selector }
      )
    ) as any
  }

  text() {
    return this.chain((el) => el.text()) as any
  }

  type(text) {
    return this.chain((el) => el.type(text))
  }

  moveTo() {
    return this.chain((el) => {
      return page.hover(el.selector).then(() => el)
    })
  }

  async getComputedCss(prop: string) {
    return this.chain((el) => {
      return el.getCssValue(prop)
    }) as any
  }

  async getAttribute(attr) {
    return this.chain((el) => el.getAttribute(attr))
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
    return this.chain(() => page.$$(sel))
  }

  waitForElementByCss(selector, timeout) {
    return this.chain(() => {
      return page.waitForSelector(selector, { timeout }).then(async (el) => {
        // it seems selenium waits longer and tests rely on this behavior
        // so we wait for the load event fire before returning
        await page.waitForLoadState()
        return this.wrapElement(el, selector)
      })
    })
  }

  waitForCondition(condition, timeout) {
    return this.chain(() => {
      return page.waitForFunction(
        `function() {
        return ${condition}
      }`,
        { timeout }
      )
    })
  }

  async eval(snippet) {
    return this.chain(() => page.evaluate(snippet).catch(() => null))
  }

  async evalAsync(snippet) {
    if (typeof snippet === 'function') {
      snippet = snippet.toString()
    }

    if (snippet.includes(`var callback = arguments[arguments.length - 1]`)) {
      snippet = `function() {
        return new Promise((resolve, reject) => {
          const origFunc = ${snippet}
          try {
            origFunc(resolve)
          } catch (err) {
            reject(err)
          }
        })
      }`
    }

    return page.evaluate(snippet).catch(() => null)
  }

  async log() {
    return this.chain(() => pageLogs) as any
  }

  async url() {
    return this.chain(() => page.evaluate('window.location.href')) as any
  }
}

export default Playwright
