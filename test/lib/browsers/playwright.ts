import { BrowserInterface, Event } from './base'
import fs from 'fs-extra'
import {
  chromium,
  webkit,
  firefox,
  Browser,
  BrowserContext,
  Page,
  ElementHandle,
  devices,
} from 'playwright-chromium'
import path from 'path'

let page: Page
let browser: Browser
let context: BrowserContext
let contextHasJSEnabled: boolean = true
let pageLogs: Array<{ source: string; message: string }> = []
let websocketFrames: Array<{ payload: string | Buffer }> = []

const tracePlaywright = process.env.TRACE_PLAYWRIGHT

// loose global to register teardown functions before quitting the browser instance.
// This is due to `quit` can be called anytime outside of BrowserInterface's lifecycle,
// which can create corrupted state by terminating the context.
// [TODO] global `quit` might need to be removed, instead should introduce per-instance teardown
const pendingTeardown = []
export async function quit() {
  await Promise.all(pendingTeardown.map((fn) => fn()))
  await context?.close()
  await browser?.close()
  context = undefined
  browser = undefined
}

async function teardown(tearDownFn: () => Promise<void>) {
  pendingTeardown.push(tearDownFn)
  await tearDownFn()
  pendingTeardown.splice(pendingTeardown.indexOf(tearDownFn), 1)
}

interface ElementHandleExt extends ElementHandle {
  getComputedCss(prop: string): Promise<string>
  text(): Promise<string>
}

export class Playwright extends BrowserInterface {
  private activeTrace?: string
  private eventCallbacks: Record<Event, Set<(...args: any[]) => void>> = {
    request: new Set(),
  }
  private async initContextTracing(
    url: string,
    page: Page,
    context: BrowserContext
  ) {
    if (!tracePlaywright) {
      return
    }

    try {
      // Clean up if any previous traces are still active
      await teardown(this.teardownTracing.bind(this))

      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      })
      this.activeTrace = encodeURIComponent(url)

      page.on('close', async () => {
        await teardown(this.teardownTracing.bind(this))
      })
    } catch (e) {
      this.activeTrace = undefined
    }
  }

  private async teardownTracing() {
    if (!tracePlaywright || !this.activeTrace) {
      return
    }

    try {
      const traceDir = path.join(__dirname, '../../traces')
      const traceOutputPath = path.join(
        traceDir,
        `${path
          .relative(path.join(__dirname, '../../'), process.env.TEST_FILE_PATH)
          .replace(/\//g, '-')}`,
        `playwright-${this.activeTrace}-${Date.now()}.zip`
      )

      await fs.remove(traceOutputPath)
      await context.tracing.stop({
        path: traceOutputPath,
      })
    } catch (e) {
      require('console').warn('Failed to teardown playwright tracing', e)
    } finally {
      this.activeTrace = undefined
    }
  }

  on(event: Event, cb: (...args: any[]) => void) {
    if (!this.eventCallbacks[event]) {
      throw new Error(
        `Invalid event passed to browser.on, received ${event}. Valid events are ${Object.keys(
          this.eventCallbacks
        )}`
      )
    }
    this.eventCallbacks[event]?.add(cb)
  }
  off(event: Event, cb: (...args: any[]) => void) {
    this.eventCallbacks[event]?.delete(cb)
  }

  async setup(
    browserName: string,
    locale: string,
    javaScriptEnabled: boolean,
    ignoreHTTPSErrors: boolean,
    headless: boolean
  ) {
    let device

    if (process.env.DEVICE_NAME) {
      device = devices[process.env.DEVICE_NAME]

      if (!device) {
        throw new Error(
          `Invalid playwright device name ${process.env.DEVICE_NAME}`
        )
      }
    }

    if (browser) {
      if (contextHasJSEnabled !== javaScriptEnabled) {
        // If we have switched from having JS enable/disabled we need to recreate the context.
        await teardown(this.teardownTracing.bind(this))
        await context?.close()
        context = await browser.newContext({
          locale,
          javaScriptEnabled,
          ignoreHTTPSErrors,
          ...device,
        })
        contextHasJSEnabled = javaScriptEnabled
      }
      return
    }

    browser = await this.launchBrowser(browserName, { headless })
    context = await browser.newContext({
      locale,
      javaScriptEnabled,
      ignoreHTTPSErrors,
      ...device,
    })
    contextHasJSEnabled = javaScriptEnabled
  }

  async launchBrowser(browserName: string, launchOptions: Record<string, any>) {
    if (browserName === 'safari') {
      return await webkit.launch(launchOptions)
    } else if (browserName === 'firefox') {
      return await firefox.launch({
        ...launchOptions,
        firefoxUserPrefs: {
          ...launchOptions.firefoxUserPrefs,
          // The "fission.webContentIsolationStrategy" pref must be
          // set to 1 on Firefox due to the bug where a new history
          // state is pushed on a page reload.
          // See https://github.com/microsoft/playwright/issues/22640
          // See https://bugzilla.mozilla.org/show_bug.cgi?id=1832341
          'fission.webContentIsolationStrategy': 1,
        },
      })
    } else {
      return await chromium.launch({
        devtools: !launchOptions.headless,
        ...launchOptions,
        ignoreDefaultArgs: ['--disable-back-forward-cache'],
      })
    }
  }

  async get(url: string): Promise<void> {
    await page.goto(url)
  }

  async loadPage(
    url: string,
    opts?: {
      disableCache: boolean
      cpuThrottleRate: number
      pushErrorAsConsoleLog?: boolean
      beforePageLoad?: (...args: any[]) => void
    }
  ) {
    // clean-up existing pages
    for (const oldPage of context.pages()) {
      await oldPage.close()
    }

    page = await context.newPage()
    await this.initContextTracing(url, page, context)

    // in development compilation can take longer due to
    // lower CPU availability in GH actions
    page.setDefaultTimeout(60 * 1000)
    page.setDefaultNavigationTimeout(60 * 1000)

    pageLogs = []
    websocketFrames = []

    page.on('console', (msg) => {
      console.log('browser log:', msg)
      pageLogs.push({ source: msg.type(), message: msg.text() })
    })
    page.on('crash', (page) => {
      console.error('page crashed')
    })
    page.on('pageerror', (error) => {
      console.error('page error', error)

      if (opts?.pushErrorAsConsoleLog) {
        pageLogs.push({ source: 'error', message: error.message })
      }
    })
    page.on('request', (req) => {
      this.eventCallbacks.request.forEach((cb) => cb(req))
    })

    if (opts?.disableCache) {
      // TODO: this doesn't seem to work (dev tools does not check the box as expected)
      const session = await context.newCDPSession(page)
      session.send('Network.setCacheDisabled', { cacheDisabled: true })
    }

    if (opts?.cpuThrottleRate) {
      const session = await context.newCDPSession(page)
      // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate
      session.send('Emulation.setCPUThrottlingRate', {
        rate: opts.cpuThrottleRate,
      })
    }

    page.on('websocket', (ws) => {
      if (tracePlaywright) {
        page
          .evaluate(`console.log('connected to ws at ${ws.url()}')`)
          .catch(() => {})

        ws.on('close', () =>
          page
            .evaluate(`console.log('closed websocket ${ws.url()}')`)
            .catch(() => {})
        )
      }
      ws.on('framereceived', (frame) => {
        websocketFrames.push({ payload: frame.payload })

        if (tracePlaywright) {
          page
            .evaluate(`console.log('received ws message ${frame.payload}')`)
            .catch(() => {})
        }
      })
    })

    opts?.beforePageLoad?.(page)

    await page.goto(url, { waitUntil: 'load' })
  }

  back(options): BrowserInterface {
    return this.chain(async () => {
      await page.goBack(options)
    })
  }
  forward(options): BrowserInterface {
    return this.chain(async () => {
      await page.goForward(options)
    })
  }
  refresh(): BrowserInterface {
    return this.chain(async () => {
      await page.reload()
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
    return this.chain(async () =>
      context.addCookies([
        {
          path: '/',
          domain: await page.evaluate('window.location.hostname'),
          ...opts,
        },
      ])
    )
  }
  deleteCookies(): BrowserInterface {
    return this.chain(async () => context.clearCookies())
  }

  focusPage() {
    return this.chain(() => page.bringToFront())
  }

  private wrapElement(el: ElementHandle, selector: string): ElementHandleExt {
    function getComputedCss(prop: string) {
      return page.evaluate(
        function (args) {
          const style = getComputedStyle(document.querySelector(args.selector))
          return style[args.prop] || null
        },
        { selector, prop }
      )
    }

    return Object.assign(el, {
      selector,
      getComputedCss,
      text: () => el.innerText(),
    })
  }

  elementByCss(selector: string) {
    return this.waitForElementByCss(selector)
  }

  elementById(sel) {
    return this.elementByCss(`#${sel}`)
  }

  getValue() {
    return this.chain((el: ElementHandleExt) => el.inputValue())
  }

  text() {
    return this.chain((el: ElementHandleExt) => el.innerText())
  }

  type(text) {
    return this.chain((el: ElementHandleExt) => el.type(text))
  }

  moveTo() {
    return this.chain((el: ElementHandleExt) => {
      return el.hover().then(() => el)
    })
  }

  async getComputedCss(prop: string) {
    return this.chain((el: ElementHandleExt) => {
      return el.getComputedCss(prop)
    }) as any
  }

  async getAttribute<T = any>(attr) {
    return this.chain((el: ElementHandleExt) => el.getAttribute(attr)) as T
  }

  hasElementByCssSelector(selector: string) {
    return this.eval<boolean>(`!!document.querySelector('${selector}')`)
  }

  keydown(key: string): BrowserInterface {
    return this.chain((el: ElementHandleExt) => {
      return page.keyboard.down(key).then(() => el)
    })
  }

  keyup(key: string): BrowserInterface {
    return this.chain((el: ElementHandleExt) => {
      return page.keyboard.up(key).then(() => el)
    })
  }

  click() {
    return this.chain((el: ElementHandleExt) => {
      return el.click().then(() => el)
    })
  }

  touchStart() {
    return this.chain((el: ElementHandleExt) => {
      return el.dispatchEvent('touchstart').then(() => el)
    })
  }

  elementsByCss(sel) {
    return this.chain(() =>
      page.$$(sel).then((els) => {
        return els.map((el) => {
          const origGetAttribute = el.getAttribute.bind(el)
          el.getAttribute = (name) => {
            // ensure getAttribute defaults to empty string to
            // match selenium
            return origGetAttribute(name).then((val) => val || '')
          }
          return el
        })
      })
    ) as any as BrowserInterface[]
  }

  waitForElementByCss(selector, timeout?: number) {
    return this.chain(() => {
      return page
        .waitForSelector(selector, { timeout, state: 'attached' })
        .then(async (el) => {
          // it seems selenium waits longer and tests rely on this behavior
          // so we wait for the load event fire before returning
          await page.waitForLoadState()
          return this.wrapElement(el, selector)
        })
    })
  }

  waitForCondition(condition, timeout) {
    return this.chain(() => {
      return page.waitForFunction(condition, { timeout })
    })
  }

  eval<T = any>(fn: any, ...args: any[]): Promise<T> {
    return this.chainWithReturnValue(() =>
      page
        .evaluate(fn, ...args)
        .catch((err) => {
          console.error('eval error:', err)
          return null
        })
        .then(async (val) => {
          await page.waitForLoadState()
          return val as T
        })
    )
  }

  async evalAsync<T = any>(fn: any, ...args: any[]) {
    if (typeof fn === 'function') {
      fn = fn.toString()
    }

    if (fn.includes(`var callback = arguments[arguments.length - 1]`)) {
      fn = `(function() {
        return new Promise((resolve, reject) => {
          const origFunc = ${fn}
          try {
            origFunc(resolve)
          } catch (err) {
            reject(err)
          }
        })
      })()`
    }

    return page.evaluate<T>(fn).catch(() => null)
  }

  async log() {
    return this.chain(() => pageLogs) as any
  }

  async websocketFrames() {
    return this.chain(() => websocketFrames) as any
  }

  async url() {
    return this.chain(() => page.evaluate('window.location.href')) as any
  }

  async waitForIdleNetwork(): Promise<void> {
    return this.chain(() => {
      return page.waitForLoadState('networkidle')
    })
  }
}
