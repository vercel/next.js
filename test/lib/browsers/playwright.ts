import fs from 'fs-extra'
import { debugPrint } from 'next-test-utils'
import {
  chromium,
  webkit,
  firefox,
  Browser,
  BrowserContext,
  Page,
  ElementHandle,
  devices,
  Locator,
  Request as PlaywrightRequest,
  Response as PlaywrightResponse,
  BrowserContextOptions,
} from 'playwright'
import path from 'path'

type EventType = 'request' | 'response'

type PageLog = { source: string; message: string; args: unknown[] }

export type Permissions = BrowserContextOptions['permissions']

export function getDeviceOptionsByName(deviceName: string | undefined) {
  if (!deviceName) {
    return undefined
  }
  if (!(deviceName in devices)) {
    throw new Error(`Invalid playwright device name ${deviceName}`)
  }
  return devices[deviceName as keyof typeof devices]
}

export async function launchBrowserProcess(
  browserName: string,
  launchOptions: { headless: boolean }
) {
  if (browserName === 'safari') {
    return await webkit.launch(launchOptions)
  } else if (browserName === 'firefox') {
    return await firefox.launch({
      ...launchOptions,
      firefoxUserPrefs: {
        // The "fission.webContentIsolationStrategy" pref must be
        // set to 1 on Firefox due to the bug where a new history
        // state is pushed on a page reload.
        // See https://github.com/microsoft/playwright/issues/22640
        // See https://bugzilla.mozilla.org/show_bug.cgi?id=1832341
        'fission.webContentIsolationStrategy': 1,
      },
    })
  } else {
    let launchArgs: string[] = []
    if (!launchOptions.headless) {
      launchArgs.push('--auto-open-devtools-for-tabs')
    }
    return await chromium.launch({
      ...launchOptions,
      args: launchArgs,
      ignoreDefaultArgs: ['--disable-back-forward-cache'],
    })
  }
}

const tracePlaywright = process.env.TRACE_PLAYWRIGHT

const defaultTimeout = process.env.NEXT_E2E_TEST_TIMEOUT
  ? parseInt(process.env.NEXT_E2E_TEST_TIMEOUT, 10)
  : // In development mode, compilation can take longer due to lower CPU
    // availability in GitHub Actions.
    60 * 1000

interface ElementHandleExt extends ElementHandle {
  getComputedCss(prop: string): Promise<string>
  text(): Promise<string>
}

export type ElementByCssOpts = {
  timeout?: number
  /**
   * The state of the DOM element.
   * @default 'visible'
   */
  state?: 'attached' | 'visible' | 'hidden'
  /**
   * The state of the page.
   * @default 'load'
   */
  waitUntil?: false | 'load' | 'domcontentloaded' | 'networkidle'
}

export type PlaywrightNavigationWaitUntil =
  | 'load'
  | 'domcontentloaded'
  | 'networkidle'
  | 'commit'

export class Playwright<TCurrent = undefined> {
  context: BrowserContext

  _page: Page | null = null
  get page() {
    const page = this._page
    if (!page) {
      throw new Error('Expected a page to be loaded')
    }
    return page
  }

  constructor(context: BrowserContext) {
    this.context = context
  }

  private activeTrace?: string
  private eventCallbacks: Record<EventType, Set<(...args: any[]) => void>> = {
    request: new Set(),
    response: new Set(),
  }

  private pageLogs: Array<Promise<PageLog> | PageLog> = []
  private websocketFrames: Array<{ payload: string | Buffer }> = []

  static async create(browser: Browser, options: BrowserContextOptions) {
    const context = await browser.newContext(options)
    return new Playwright(context)
  }

  private async initContextTracing(url: string) {
    if (!tracePlaywright) {
      return
    }

    try {
      // Clean up if any previous traces are still active
      await this.teardownTracing()

      await this.context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      })
      this.activeTrace = encodeURIComponent(url)
    } catch (e) {
      this.activeTrace = undefined
    }
  }

  private async teardownTracing() {
    if (!this.activeTrace) {
      return
    }

    try {
      const traceDir = path.join(__dirname, '../../traces')
      const traceOutputPath = path.join(
        traceDir,
        `${path
          .relative(path.join(__dirname, '../../'), process.env.TEST_FILE_PATH!)
          .replace(/\//g, '-')}`,
        `playwright-${this.activeTrace}-${Date.now()}.zip`
      )

      await fs.remove(traceOutputPath)
      await this.context.tracing.stop({
        path: traceOutputPath,
      })
    } catch (e) {
      require('console').warn('Failed to teardown playwright tracing', e)
    } finally {
      this.activeTrace = undefined
    }
  }

  on(
    event: 'request',
    cb: (request: PlaywrightRequest) => void | Promise<void>
  ): void
  on(
    event: 'response',
    cb: (request: PlaywrightResponse) => void | Promise<void>
  ): void
  on(event: EventType, cb: (...args: any[]) => void) {
    if (!this.eventCallbacks[event]) {
      throw new Error(
        `Invalid event passed to browser.on, received ${event}. Valid events are ${Object.keys(
          this.eventCallbacks
        )}`
      )
    }
    this.eventCallbacks[event]?.add(cb)
  }

  off(
    event: 'request',
    cb: (request: PlaywrightRequest) => void | Promise<void>
  ): void
  off(
    event: 'response',
    cb: (request: PlaywrightResponse) => void | Promise<void>
  ): void
  off(event: EventType, cb: (...args: any[]) => void) {
    this.eventCallbacks[event]?.delete(cb)
  }

  async close(): Promise<void> {
    await this.teardownTracing()

    const page = this._page
    if (page) {
      this._page = null
      this.pageLogs = []
      this.websocketFrames = []
      await page.close()
    }

    // clean-up other existing pages
    for (const oldPage of this.context.pages()) {
      await oldPage.close()
    }
  }

  async destroy() {
    await this.close()
    await this.context.close()
  }

  async get(url: string): Promise<void> {
    await this.page.goto(url)
  }

  async loadPage(
    url: string,
    opts?: {
      disableCache?: boolean
      cpuThrottleRate?: number
      pushErrorAsConsoleLog?: boolean
      beforePageLoad?: (page: Page) => void | Promise<void>
      /**
       * @see {@link https://playwright.dev/docs/api/class-page#page-set-extra-http-headers Playwright.Page.setExtraHTTPHeaders}
       */
      extraHTTPHeaders?: Record<string, string>
      waitUntil?: PlaywrightNavigationWaitUntil
    }
  ) {
    await this.close()

    await this.initContextTracing(url)

    const page = await this.context.newPage()
    const pageLogs: typeof this.pageLogs = []
    const websocketFrames: typeof this.websocketFrames = []

    this._page = page
    this.pageLogs = pageLogs
    this.websocketFrames = websocketFrames

    page.setDefaultTimeout(defaultTimeout)
    page.setDefaultNavigationTimeout(defaultTimeout)
    const extraHTTPHeaders = opts?.extraHTTPHeaders
    if (extraHTTPHeaders !== undefined) {
      page.setExtraHTTPHeaders(extraHTTPHeaders)
    }

    page.on('console', (msg) => {
      debugPrint('Browser Log:', msg)

      pageLogs.push(
        Promise.all(
          msg.args().map((handle) => handle.jsonValue().catch(() => {}))
        ).then((args) => ({ source: msg.type(), message: msg.text(), args }))
      )
    })
    page.on('crash', () => {
      console.error('page crashed')
    })
    page.on('pageerror', (error) => {
      console.error('page error', error)

      if (opts?.pushErrorAsConsoleLog) {
        pageLogs.push({
          source: 'error',
          message: error.message,
          args: [],
        })
      }
    })
    page.on('request', (req) => {
      this.eventCallbacks.request.forEach((cb) => cb(req))
    })
    page.on('response', (res) => {
      this.eventCallbacks.response.forEach((cb) => cb(res))
    })

    if (opts?.disableCache) {
      // TODO: this doesn't seem to work (dev tools does not check the box as expected)
      const session = await this.context.newCDPSession(page)
      session.send('Network.setCacheDisabled', { cacheDisabled: true })
    }

    if (opts?.cpuThrottleRate) {
      const session = await this.context.newCDPSession(page)
      // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate
      session.send('Emulation.setCPUThrottlingRate', {
        rate: opts.cpuThrottleRate,
      })
    }

    page.on('websocket', (ws) => {
      const decoder = tracePlaywright ? new TextDecoder() : null
      if (tracePlaywright) {
        // We're just evaluating a string here so that it appears in Playwright
        // traces.
        // console.log spams CI logs. If you already have a browser open, you can
        // see WebSocket messages in the network tab of dev tools.
        // TODO: Revisit once https://github.com/microsoft/playwright/issues/10996 is resolved.
        page.evaluate(`'connected to ws at ${ws.url()}'`).catch(() => {})

        ws.on('close', () =>
          page.evaluate(`'closed websocket ${ws.url()}'`).catch(() => {})
        )
      }
      ws.on('framereceived', (frame) => {
        websocketFrames.push({ payload: frame.payload })

        if (tracePlaywright) {
          const { payload } = frame
          page
            // Note that passing the payload as a an argument is 2 orders of magnitude more expensive in Playwright.
            .evaluate(
              `'received ws message ${JSON.stringify(typeof payload === 'string' ? payload : decoder!.decode(payload))}'`
            )
            .catch(() => {})
        }
      })
    })

    await opts?.beforePageLoad?.(page)

    await page.goto(url, { waitUntil: opts?.waitUntil ?? 'load' })
  }

  back(options?: Parameters<Page['goBack']>[0]) {
    // do not preserve the previous chained value, it might be invalid after a navigation.
    return this.startChain(async () => {
      await this.page.goBack(options)
    })
  }
  forward(options?: Parameters<Page['goForward']>[0]) {
    // do not preserve the previous chained value, it might be invalid after a navigation.
    return this.startChain(async () => {
      await this.page.goForward(options)
    })
  }
  refresh() {
    // do not preserve the previous chained value, it's likely to be invalid after a reload.
    return this.startChain(async () => {
      await this.page.reload()
    })
  }
  /**
   * Evict the browser HTTP cache via CDP (`Network.clearBrowserCache`). This is
   * only supported in Chromium; gate the calling test on `global.browserName
   * === 'chrome'` (Playwright's Firefox and WebKit don't expose CDP).
   */
  clearBrowserCache() {
    return this.startChain(async () => {
      const session = await context!.newCDPSession(page)
      try {
        await session.send('Network.clearBrowserCache')
      } finally {
        await session.detach()
      }
    })
  }
  setDimensions({ width, height }: { height: number; width: number }) {
    return this.startOrPreserveChain(() =>
      this.page.setViewportSize({ width, height })
    )
  }
  addCookie(opts: { name: string; value: string }) {
    return this.startOrPreserveChain(async () =>
      this.context.addCookies([
        {
          path: '/',
          domain: await this.page.evaluate('window.location.hostname'),
          ...opts,
        },
      ])
    )
  }
  deleteCookies() {
    return this.startOrPreserveChain(async () => this.context.clearCookies())
  }

  private wrapElement(el: ElementHandle, selector: string): ElementHandleExt {
    const { page } = this
    function getComputedCss(prop: string) {
      return page.evaluate(
        function (args) {
          const style = getComputedStyle(document.querySelector(args.selector)!)
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

  elementByCss(selector: string, opts?: ElementByCssOpts) {
    return this.waitForElementByCss(selector, {
      timeout: 5_000,
      ...opts,
    })
  }

  /** A replacement for the default `browser.elementByCss` that doesn't wait for the page to fire "load". */
  elementByCssInstant(selector: string, opts?: ElementByCssOpts) {
    return this.waitForElementByCss(selector, {
      timeout: 10,
      waitUntil: false,
      ...opts,
    })
  }

  hasElementByCss(selector: string) {
    return this.startChain(() => this.page.locator(selector).isVisible())
  }

  elementById(id: string) {
    return this.elementByCss(`#${id}`)
  }

  getValue(this: Playwright<ElementHandleExt>) {
    return this.continueChain((el) => el.inputValue())
  }

  text(this: Playwright<ElementHandleExt>) {
    return this.continueChain((el) => el.innerText())
  }

  type(this: Playwright<ElementHandleExt>, text: string) {
    return this.continueChain(async (el) => {
      await el.type(text)
      return el
    })
  }

  moveTo(this: Playwright<ElementHandleExt>) {
    return this.continueChain(async (el) => {
      await el.hover()
      return el
    })
  }

  async getComputedCss(this: Playwright<ElementHandleExt>, prop: string) {
    return this.continueChain((el) => el.getComputedCss(prop))
  }

  async getAttribute(this: Playwright<ElementHandleExt>, attr: string) {
    return this.continueChain((el) => el.getAttribute(attr))
  }

  hasElementByCssSelector(selector: string) {
    return this.eval<boolean>(`!!document.querySelector('${selector}')`)
  }

  keydown(key: string) {
    return this.startOrPreserveChain(() => this.page.keyboard.down(key))
  }

  keyup(key: string) {
    return this.startOrPreserveChain(() => this.page.keyboard.up(key))
  }

  click(this: Playwright<ElementHandleExt>) {
    return this.continueChain(async (el) => {
      await el.click()
      return el
    })
  }

  touchStart(this: Playwright<ElementHandleExt>) {
    return this.continueChain(async (el) => {
      await el.dispatchEvent('touchstart')
      return el
    })
  }

  elementsByCss(selector: string) {
    return this.startChain(() =>
      this.page.$$(selector).then((els) => {
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
    )
  }

  waitForElementByCss(selector: string, opts: number | ElementByCssOpts = {}) {
    const {
      timeout = 10_000,
      waitUntil = 'load', // TODO: we should get rid of this and fix the tests that implicitly rely on it
      // Selected elements may be in a completed boundary that React hasn't revealed yet.
      // We almost always want to wait for the reveal.
      // This matches Playwright's default behavior.
      // We don't care about visibility of metadata tags.
      // Can hopefully be dropped if https://github.com/microsoft/playwright/pull/37265 is accepted
      state = selector.startsWith('base') ||
      selector.startsWith('link') ||
      selector.startsWith('meta') ||
      selector.startsWith('script') ||
      selector.startsWith('source') ||
      selector.startsWith('style') ||
      selector.startsWith('title')
        ? 'attached'
        : 'visible',
    } = typeof opts === 'number' ? { timeout: opts } : opts

    return this.startChain(async () => {
      const { page } = this
      const el = await page.waitForSelector(selector, {
        timeout,
        state,
      })
      if (waitUntil !== false) {
        // it seems selenium waits longer and tests rely on this behavior
        // so we wait for the load event fire before returning
        await page.waitForLoadState(waitUntil)
      }
      return this.wrapElement(
        // Playwright has `null` as a possible return type in case `state` is `detached`,
        // but we don't allow passing that here, so we can assume it's non-null
        el!,
        selector
      )
    })
  }

  waitForCondition(snippet: string, timeout?: number) {
    return this.startOrPreserveChain(async () => {
      await this.page.waitForFunction(snippet, { timeout })
    })
  }

  // TODO: this should default to unknown, but a lot of tests use and rely on the result being `any`
  eval<TFn extends (...args: any[]) => any>(
    fn: TFn,
    ...args: Parameters<TFn>
  ): Playwright<ReturnType<TFn>> & Promise<ReturnType<TFn>>
  // TODO: this is ugly, the type parameter is basically a hidden cast
  eval<T = any>(fn: string, ...args: any[]): Playwright<T> & Promise<T>
  eval<T = any>(
    fn: string | ((...args: any[]) => any),
    ...args: any[]
  ): Playwright<T> & Promise<T>
  eval(
    fn: string | ((...args: any[]) => any),
    ...args: any[]
  ): Playwright<any> & Promise<any> {
    return this.startChain(async () => {
      const { page } = this
      return page
        .evaluate(fn, ...args)
        .catch((err) => {
          // TODO: gross, why are we doing this
          console.error('eval error:', err)
          return null!
        })
        .finally(async () => {
          await page.waitForLoadState()
        })
    })
  }

  async log<T extends boolean = false>(options?: { includeArgs?: T }) {
    return this.startChain(
      () =>
        options?.includeArgs
          ? Promise.all(this.pageLogs)
          : Promise.all(this.pageLogs).then((logs) =>
              logs.map(({ source, message }) => ({ source, message }))
            )
      // TODO: Starting with TypeScript 5.8 we might not need this type cast.
    ) as Promise<
      T extends true
        ? { source: string; message: string; args: unknown[] }[]
        : { source: string; message: string }[]
    >
  }

  async url() {
    return this.startChain(() => this.page.url())
  }

  async waitForIdleNetwork() {
    return this.startOrPreserveChain(() => {
      return this.page.waitForLoadState('networkidle')
    })
  }

  getByRole(
    role: Parameters<Page['getByRole']>[0],
    options?: Parameters<Page['getByRole']>[1]
  ) {
    return this.page.getByRole(role, options)
  }

  locateRedbox(): Locator {
    return this.page.locator(
      'nextjs-portal [aria-labelledby="nextjs__container_errors_label"]'
    )
  }

  locateDevToolsIndicator(): Locator {
    return this.page.locator(
      'nextjs-portal [data-nextjs-dev-tools-button]:visible'
    )
  }

  locator(selector: string, options?: Parameters<Page['locator']>[1]) {
    return this.page.locator(selector, options)
  }

  /** A call that expects to be chained after a previous call, because it needs its value. */
  private continueChain<TNext>(nextCall: (value: TCurrent) => Promise<TNext>) {
    return this._chain(true, nextCall)
  }

  /** Start a chain. If continuing, it overwrites the current chained value. */
  private startChain<TNext>(nextCall: () => TNext | Promise<TNext>) {
    return this._chain(false, nextCall)
  }

  /** Either start or continue a chain. If continuing, it preserves the current chained value. */
  private startOrPreserveChain(nextCall: () => Promise<void>) {
    return this._chain(false, async (value) => {
      await nextCall()
      return value
    })
  }

  // necessary for the type of the function below
  readonly [Symbol.toStringTag]: string = 'Playwright'

  private _chain<TNext>(
    this: Playwright<TCurrent>,
    mustBeChained: boolean,
    nextCall: (current: TCurrent) => TNext | Promise<TNext>
  ): Playwright<TNext> & Promise<TNext> {
    const syncError = new Error('next-browser-base-chain-error')

    // If `this` is actually a proxy created by a previous chained call, it'll act like it has a `promise` property.
    // (see proxy code below)
    type MaybeChained<T> = Playwright<T> & {
      promise?: Promise<T>
    }
    const self = this as MaybeChained<TCurrent>

    let currentPromise = self.promise
    if (!currentPromise) {
      if (mustBeChained) {
        // Note that this should also be enforced by the type system
        // by adding appropriate `(this: Playwright<PreviousValue>)` type annotations
        // to methods that expect to be chained, but tests can bypass this (or not be checked because they use JS)
        throw new Error(
          'Expected this call to be chained after a previous call'
        )
      } else {
        // We're handling a call that does not expect to be chained after a previous one,
        // so it's safe to default the current value to undefined -- we don't need a value to invoke `nextCall`
        currentPromise = Promise.resolve(undefined as TCurrent)
      }
    }

    const promise = currentPromise.then(nextCall).catch((reason: unknown) => {
      // TODO: only patch the stacktrace if the sync callstack is missing from it
      if (reason && typeof reason === 'object' && 'stack' in reason) {
        const syncCallStack = syncError.stack!.split(syncError.message)[1]
        reason.stack += `\n${syncCallStack}`
      }
      throw reason
    })

    function get(target: Playwright<TCurrent>, p: string | symbol): any {
      switch (p) {
        case 'promise':
          return promise
        case 'then':
          return promise.then.bind(promise)
        case 'catch':
          return promise.catch.bind(promise)
        case 'finally':
          return promise.finally.bind(promise)
        default:
          return target[p]
      }
    }

    // @ts-expect-error: we're changing `TCurrent` into TNext via proxy hacks
    return new Proxy(this, {
      get,
    })
  }
}
