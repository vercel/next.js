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
} from 'playwright'
import path from 'path'
import { getCurrentTestTraceOutputDir } from '../test-trace-output'
import { isValidRelativeUrl } from './utils/relative-url'
import { patchBrowserContextRemoveAllListeners } from './utils/patch-remove-all-listeners'

type EventType = 'request' | 'response'

export type BrowserOptions = {
  browserName: string
  headless: boolean
  enableTracing: boolean
}

export type BrowserContextOptions = {
  locale: string | undefined
  javaScriptEnabled: boolean
  ignoreHTTPSErrors: boolean
  userAgent: string | undefined
  deviceName: string | undefined
}

export class SharedPlaywrightState {
  private constructor(
    public browser: Browser,
    public defaultContext: BrowserContextWrapper,
    public browserOptions: BrowserOptions
  ) {}
  private secondaryContexts = new Set<BrowserContextWrapper>()

  static async create(
    browserOptions: BrowserOptions,
    contextOptions: BrowserContextOptions
  ): Promise<SharedPlaywrightState> {
    const { browserName, headless } = browserOptions
    const browser = await launchBrowser(browserName, { headless })

    const tracingEnabled = browserOptions.enableTracing
    const defaultContext = await BrowserContextWrapper.create(
      browser,
      contextOptions,
      tracingEnabled
    )
    return new SharedPlaywrightState(browser, defaultContext, browserOptions)
  }

  public async createSecondaryBrowserContext(options: BrowserContextOptions) {
    const context = await BrowserContextWrapper.create(
      this.browser,
      options,
      this.tracingEnabled()
    )
    this.secondaryContexts.add(context)
    return context
  }

  canReuseBrowser(browserOptions: BrowserOptions) {
    // if a browser configuration option changed, we have to recreate the whole state.
    return !SharedPlaywrightState.optionChanged(
      this.browserOptions,
      browserOptions
    )
  }

  async updateDefaultBrowserContext(newOptions: BrowserContextOptions) {
    // if a browser context configuration option changed, we have to recreate the context.
    if (
      SharedPlaywrightState.optionChanged(
        this.defaultContext.options,
        newOptions
      )
    ) {
      await this.defaultContext.close()
      this.defaultContext = await BrowserContextWrapper.create(
        this.browser,
        newOptions,
        this.tracingEnabled()
      )
    }
    return this.defaultContext
  }

  private static optionChanged<T extends Record<string, any>>(
    prev: T,
    current: T
  ): boolean {
    for (const [key, prevValue] of Object.entries(prev)) {
      const currentValue = current[key]
      if (currentValue !== prevValue) {
        return true
      }
    }
    return false
  }

  async close() {
    await this.closeAllContexts()
    await this.browser.close()
    this.browser = null!
  }

  async closeAllContexts() {
    await Promise.all([
      this.defaultContext.close().finally(() => {
        this.defaultContext = null!
      }),
      ...Array.from(this.secondaryContexts).map((context) =>
        context.close().finally(() => this.secondaryContexts.delete(context))
      ),
    ])
  }

  tracingEnabled() {
    return this.browserOptions.enableTracing
  }
}

export class BrowserContextWrapper {
  private _isClosed = false
  private closePromise: Promise<void> | null = null
  isClosed() {
    return this._isClosed
  }

  private constructor(
    public context: BrowserContext,
    public options: BrowserContextOptions,
    public tracer: Tracer | null
  ) {}

  static async create(
    browser: Browser,
    options: BrowserContextOptions,
    tracingEnabled: boolean
  ): Promise<BrowserContextWrapper> {
    const {
      locale,
      javaScriptEnabled,
      ignoreHTTPSErrors,
      userAgent,
      deviceName,
    } = options

    type Devices = typeof import('playwright').devices
    type Device = Devices[keyof Devices]
    let device: Device | undefined

    if (deviceName !== undefined) {
      device = devices[deviceName]
      if (!device) {
        throw new Error(`Invalid Playwright device name ${deviceName}`)
      }
    }

    const context = await browser.newContext({
      locale,
      javaScriptEnabled,
      ignoreHTTPSErrors,
      ...(userAgent ? { userAgent } : {}),
      ...device,
    })

    const tracer = tracingEnabled ? await Tracer.start(context) : null

    patchBrowserContextRemoveAllListeners(context)
    return new BrowserContextWrapper(context, options, tracer)
  }

  async reset() {
    // TODO: clean up context before reusing it
  }

  async close() {
    if (this.isClosed()) {
      return
    } else if (this.closePromise) {
      return this.closePromise
    }

    this.closePromise = (async () => {
      if (this.tracer) {
        await this.tracer.close()
      }
      await this.reset()
      await this.context.close()

      this._isClosed = true
      this.closePromise = null
    })()
    return this.closePromise
  }
}

type StartedTraceInfo = {
  id: number
  name: string
}

type TraceState =
  | { kind: 'initial' }
  | { kind: 'starting'; info: StartedTraceInfo; promise: Promise<void> }
  | { kind: 'started'; info: StartedTraceInfo }
  | { kind: 'ending'; info: StartedTraceInfo; promise: Promise<void> }
  | { kind: 'ended' }

// This is global so that it's shared for all browsers created in a test file
// (even if the shared playwright state gets recreated)
let nextTraceId = 0

const moduleInitializationTime = Date.now()

class Tracer {
  private traceState: TraceState = { kind: 'initial' }

  private constructor(private context: BrowserContext) {}

  static async start(context: BrowserContext) {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    })
    return new Tracer(context)
  }

  async close() {
    // if the trace didn't get ended normally for some reason, we should end it here to avoid dropping it.
    const { traceState } = this
    if (traceState.kind !== 'initial' && traceState.kind !== 'ended') {
      try {
        await this.ensureCurrentTraceEnded()
      } catch (err) {
        require('console').warn(
          `Failed to end playwright trace '${traceState.info.name}' while tearing down`,
          err
        )
      }
    }

    try {
      await this.context.tracing.stop()
    } catch (e) {
      require('console').warn('Failed to teardown playwright tracing', e)
    }
  }

  async startTrace(rawName: string): Promise<void> {
    const traceId = nextTraceId++
    const name = `${traceId}. ${rawName}`

    const { traceState } = this
    if (traceState.kind !== 'initial' && traceState.kind !== 'ended') {
      // This shouldn't ever happen. We're going to error, but first, make sure we're in a consistent state
      // to prevent cascading errors in other tests.
      await this.ensureCurrentTraceEnded()
      const stateDescription =
        traceState.kind === 'started' ? 'still running' : traceState.kind
      throw new Error(
        `Cannot start a new trace '${name}' while the previous trace '${traceState.info.name}' is ${stateDescription}`
      )
    }

    const info: StartedTraceInfo = {
      id: traceId,
      name,
    }

    try {
      this.traceState = {
        kind: 'starting',
        info,
        promise: this.context.tracing.startChunk({
          title: name,
        }),
      }
      await this.traceState.promise
      this.traceState = { kind: 'started', info }
    } catch (err) {
      this.traceState = { kind: 'initial' }
      throw new Error(`Failed to start playwright trace '${name}'`, {
        cause: err,
      })
    }
  }

  async endTrace() {
    const { traceState } = this
    if (traceState.kind !== 'started') {
      throw new Error('Cannot call endTrace with no active trace')
    }

    const fileName = this.generateTraceFilename(traceState.info)
    const traceOutputDir = getCurrentTestTraceOutputDir()
    const traceOutputPath = path.join(traceOutputDir, fileName)

    try {
      this.traceState = {
        kind: 'ending',
        info: traceState.info,
        promise: this.context.tracing.stopChunk({ path: traceOutputPath }),
      }
      await this.traceState.promise
    } catch (err) {
      throw new Error(
        `An error occurred while stopping playwright trace '${traceState.info.name}'`,
        { cause: err }
      )
    } finally {
      this.traceState = { kind: 'ended' }
    }
  }

  private async ensureCurrentTraceEnded() {
    const { traceState } = this
    if (traceState.kind === 'starting') {
      await traceState.promise
      if (this.traceState.kind === 'started') {
        await this.endTrace()
      }
    } else if (traceState.kind === 'started') {
      await this.endTrace()
    } else if (traceState.kind === 'ending') {
      // finish shutdown
      await traceState.promise
    }
  }

  private generateTraceFilename(traceInfo: StartedTraceInfo) {
    // Make sure that the filename doesn't exceed 255 characters,
    // which is a common filename length limit.
    // (exceeding it causes an ENAMETOOLONG when saving the trace)
    // https://stackoverflow.com/a/54742403
    const maxTotalLength = 255

    const prefix = `pw-${moduleInitializationTime}-${traceInfo.id}-`
    const suffix = `-${Date.now()}.zip`

    const maxInfixLength = maxTotalLength - (prefix.length + suffix.length)
    const infix = encodeURIComponent(traceInfo.name).slice(0, maxInfixLength)
    return prefix + infix + suffix
  }
}

async function launchBrowser(
  browserName: string,
  launchOptions: Record<string, any>
) {
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

const defaultTimeout = process.env.NEXT_E2E_TEST_TIMEOUT
  ? parseInt(process.env.NEXT_E2E_TEST_TIMEOUT, 10)
  : // In development mode, compilation can take longer due to lower CPU
    // availability in GitHub Actions.
    60 * 1000

interface ElementHandleExt extends ElementHandle {
  getComputedCss(prop: string): Promise<string>
  text(): Promise<string>
}

export type NavigationOptions = {
  /**
   * whether to wait for React hydration to finish
   */
  waitHydration?: boolean
  /**
   * allow retrying hydration wait if reload occurs
   */
  retryWaitHydration?: boolean
}

type PageLog = { source: string; message: string; args: unknown[] }

type PageState = {
  page: Page
  logs: Array<Promise<PageLog> | PageLog>
  websocketFrames: Array<{ payload: string | Buffer }>
}

export class Playwright<TCurrent = undefined> {
  constructor(
    private sharedState: SharedPlaywrightState,
    private context: BrowserContextWrapper,
    private baseUrl: string
  ) {}

  private _pageState: PageState | null = null

  private getReadyState(): PageState {
    if (this._pageState === null) {
      throw new Error('No page available')
    }
    return this._pageState
  }

  get page(): Page {
    const state = this.getReadyState()
    return state.page
  }

  private eventCallbacks: Record<EventType, Set<(...args: any[]) => void>> = {
    request: new Set(),
    response: new Set(),
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
    if (!this._pageState) {
      return
    }
    await this.context.tracer?.endTrace()
    await this.reset()
  }

  async reset() {
    const state = this._pageState
    if (!state) {
      return
    }
    const { page } = state
    if (!page.isClosed()) {
      await page.close()
    }
    this._pageState = null

    // clean-up existing pages
    const { context } = this
    await Promise.all(
      context.context.pages().map(async (oldPage) => {
        if (!oldPage.isClosed()) {
          await oldPage.close()
        }
      })
    )
  }

  async get(url: string, opts?: NavigationOptions): Promise<void> {
    url = this.resolveUrl(url)
    await this.page.goto(url, { waitUntil: 'load' })

    const waitHydration = opts?.waitHydration ?? true
    if (waitHydration && this.context.options.javaScriptEnabled) {
      await this.waitForHydration(opts?.retryWaitHydration)
    }
  }

  async loadPage(
    url: string,
    opts?: {
      disableCache?: boolean
      cpuThrottleRate?: number
      pushErrorAsConsoleLog?: boolean
      beforePageLoad?: (page: Page) => void
    } & NavigationOptions
  ) {
    url = this.resolveUrl(url)
    if (this._pageState) {
      // loadPage may be called multiple times within a single test.
      // in that case, we need to reset.
      await this.reset()
    } else {
      // if this is the first time loadPage is called in this test, start a trace.
      // otherwise, we should already have a trace running.

      // omit the host from the trace name if it's `localhost[:port]`, because that's not useful.
      const urlObj = new URL(url)
      const traceName =
        urlObj.hostname === 'localhost'
          ? urlObj.pathname + urlObj.search + urlObj.hash
          : url

      await this.context.tracer?.startTrace(traceName)
    }

    const { context } = this

    const setupPage = async (pageState: PageState) => {
      const { page, logs: pageLogs, websocketFrames } = pageState

      page.setDefaultTimeout(defaultTimeout)
      page.setDefaultNavigationTimeout(defaultTimeout)

      page.on('console', (msg) => {
        console.log('browser log:', msg)
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
        const session = await context.context.newCDPSession(page)
        session.send('Network.setCacheDisabled', { cacheDisabled: true })
      }

      if (opts?.cpuThrottleRate) {
        const session = await context.context.newCDPSession(page)
        // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate
        session.send('Emulation.setCPUThrottlingRate', {
          rate: opts.cpuThrottleRate,
        })
      }

      page.on('websocket', (ws) => {
        if (this.sharedState.tracingEnabled()) {
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

          if (this.sharedState.tracingEnabled()) {
            page
              .evaluate(`console.log('received ws message ${frame.payload}')`)
              .catch(() => {})
          }
        })
      })

      opts?.beforePageLoad?.(page)
    }

    const newPageState: PageState = {
      page: await context.context.newPage(),
      logs: [],
      websocketFrames: [],
    }

    await setupPage(newPageState)
    this._pageState = newPageState

    await this.get(url, {
      waitHydration: opts?.waitHydration,
      retryWaitHydration: opts?.retryWaitHydration,
    })
  }

  resolveUrl(url: string) {
    // no strictmode, so null/undefined can happen
    if (typeof url !== 'string') {
      throw new Error(`Expected a valid url string, got ${url}`)
    }

    if (this.baseUrl === null) {
      if (isValidRelativeUrl(url)) {
        throw new Error('Cannot use base urls when no baseUrl is set')
      }
      // the url might be absolute. if it's malformed, this'll throw here
      return new URL(url).href
    } else {
      return new URL(url, this.baseUrl).href
    }
  }

  setBaseUrl(baseUrl: string) {
    // no strictmode, so null/undefined can happen
    if (typeof baseUrl !== 'string') {
      throw new Error(`Expected a valid url string, got ${baseUrl}`)
    }
    try {
      new URL(baseUrl)
    } catch {
      throw new Error(`Expected baseUrl to be a valid URL, got: '${baseUrl}'`)
    }
    this.baseUrl = baseUrl
  }

  async waitForHydration(retry = false) {
    // Wait for application to hydrate
    console.log(`\n> Waiting hydration for ${this.page.url()}\n`)

    const checkHydrated = async () => {
      await this.page.evaluate(() => {
        return new Promise<void>((callback) => {
          // if it's not a Next.js app return
          if (
            !document.documentElement.innerHTML.includes('__NEXT_DATA__') &&
            // @ts-ignore next exists on window if it's a Next.js page.
            typeof ((window as any).next && (window as any).next.version) ===
              'undefined'
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
            let timeout = setTimeout(callback, 10 * 1000)
            ;(window as any).__NEXT_HYDRATED_CB = function () {
              clearTimeout(timeout)
              console.log('Next.js hydrate callback fired')
              callback()
            }
          }
        })
      })
    }

    try {
      await checkHydrated()
    } catch (err) {
      if (retry) {
        // re-try in case the page reloaded during check
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await checkHydrated()
      } else {
        console.error('failed to check hydration')
        throw err
      }
    }

    console.log(`\n> Hydration complete for ${this.page.url()}\n`)
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
  setDimensions({ width, height }: { height: number; width: number }) {
    return this.startOrPreserveChain(() =>
      this.page.setViewportSize({ width, height })
    )
  }
  addCookie(opts: { name: string; value: string }) {
    return this.startOrPreserveChain(async () =>
      this.context.context.addCookies([
        {
          path: '/',
          domain: await this.page.evaluate('window.location.hostname'),
          ...opts,
        },
      ])
    )
  }
  deleteCookies() {
    return this.startOrPreserveChain(async () =>
      this.context.context.clearCookies()
    )
  }

  private wrapElement(el: ElementHandle, selector: string): ElementHandleExt {
    function getComputedCss(prop: string) {
      return this.page.evaluate(
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

  elementByCss(selector: string) {
    return this.waitForElementByCss(selector, 5_000)
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

  waitForElementByCss(selector: string, timeout = 10_000) {
    return this.startChain(async () => {
      const el = await this.page.waitForSelector(selector, {
        timeout,
        state: 'attached',
      })
      // it seems selenium waits longer and tests rely on this behavior
      // so we wait for the load event fire before returning
      await this.page.waitForLoadState()
      return this.wrapElement(el, selector)
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
    return this.startChain(async () =>
      this.page.evaluate(fn, ...args).catch((err) => {
        throw new Error(
          `Error while evaluating \`${typeof fn === 'string' ? fn : fn.toString()}\``,
          { cause: err }
        )
      })
    )
  }

  async log<T extends boolean = false>(options?: { includeArgs?: T }) {
    return this.startChain(() => {
      const state = this.getReadyState()
      return (
        options?.includeArgs
          ? Promise.all(state.logs)
          : Promise.all(state.logs).then((logs) =>
              logs.map(({ source, message }) => ({ source, message }))
            )
      ) as Promise<
        T extends true
          ? { source: string; message: string; args: unknown[] }[]
          : { source: string; message: string }[]
      >
      // TODO: Starting with TypeScript 5.8 we might not need this type cast.
    })
  }

  async websocketFrames() {
    return this.startChain(() => this.getReadyState().websocketFrames)
  }

  async url() {
    return this.startChain(() => this.page.url())
  }

  async waitForIdleNetwork() {
    return this.startOrPreserveChain(() =>
      this.page.waitForLoadState('networkidle')
    )
  }

  locateRedbox(): Locator {
    return this.page.locator(
      'nextjs-portal [aria-labelledby="nextjs__container_errors_label"]'
    )
  }

  locateDevToolsIndicator(): Locator {
    return this.page.locator('nextjs-portal [data-nextjs-dev-tools-button]')
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
