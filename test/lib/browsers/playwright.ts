import {
  Page,
  ElementHandle,
  Locator,
  Request as PlaywrightRequest,
  Response as PlaywrightResponse,
} from 'playwright'
import { TimeoutGroup } from './utils/timeout-group'
import { dedupeWhilePending } from './utils/dedupe-while-pending'
import { isValidRelativeUrl } from './utils/relative-url'
import { Closable, Closer } from './utils/closable'
import { BrowserContextWrapper } from './utils/playwright-context-wrapper'
import { maxCleanupDuration } from './utils/common'

type EventType = 'request' | 'response'

export { PlaywrightManager } from './utils/playwright-manager'

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

export class Playwright<TCurrent = undefined> implements Closable {
  closer: Closer

  private baseUrl: string | null = null
  private pages: Set<Page> = new Set()

  constructor(
    private context: BrowserContextWrapper,
    public instanceName: string
  ) {
    this.closer = new Closer(this, context)
  }

  private _pageState: PageState | null = null
  private state: 'uninitialized' | 'loading' | 'ready' | 'closing' | 'closed' =
    'uninitialized'

  isClosed() {
    return this.state === 'closed'
  }

  private getReadyState(): PageState {
    this.assertReady()
    return this._pageState!
  }

  get page(): Page {
    const state = this.getReadyState()
    return state.page
  }

  private assertReady() {
    if (this.state !== 'ready') {
      throw new Error('Cannot call method while playwright is ' + this.state)
    }
    if (!this._pageState) {
      throw new Error(
        'Invariant: page state is unset despite being in a ready state'
      )
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
    this.assertReady()
    const { context } = this
    context.context.on(
      // @ts-expect-error `context.on` is an overloaded function https://github.com/microsoft/TypeScript/issues/14107
      event,
      cb
    )
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
    this.assertReady()
    const { context } = this
    context.context.off(
      // @ts-expect-error `context.on` is an overloaded function https://github.com/microsoft/TypeScript/issues/14107
      event,
      cb
    )
  }

  async close() {
    const group = TimeoutGroup.getIfAvailable()
    if (!group) {
      // This method can be called manually from a test.
      // (and unfortunately, legacy tests do it a lot)
      await TimeoutGroup.with(
        {
          description:
            'closing playwright because of a manual browser.close() call',
          maxDuration: maxCleanupDuration,
        },
        () => this.closeImpl()
      )
    } else {
      await this.closeImpl()
    }
  }

  async closeImpl() {
    if (this.state === 'uninitialized') {
      // Somehow, we got closed before we were initialized.
      return
    } else if (this.state === 'loading') {
      throw new Error('Cannot close Playwright while it is still loading')
    }

    this.state = 'closing'
    try {
      await this.reset()
      // we close Playwright after every test, but the context is preserved, so reset it.
      await this.context.reset()
    } finally {
      this.state = 'closed'
    }
  }

  private resetting = dedupeWhilePending()

  async reset() {
    await this.resetting.run(async () => {
      if (!this._pageState) {
        return
      }
      this._pageState = null

      const pages = this.pages
      this.pages.clear()
      await Promise.all(
        Array.from(pages).map((page) => this.context.closePage(page))
      )

      this.state = 'uninitialized'
    })
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

    if (this.state !== 'uninitialized') {
      // loadPage may be called multiple times within a single test.
      // in that case, we need to reset.
      await TimeoutGroup.with(
        {
          description: `resetting playwright ${this.instanceName} before loading new page`,
          maxDuration: 1_000,
        },
        () => this.reset()
      )
    } else {
      // if this is the first time loadPage is called in this test, start a trace.
      // otherwise, we should already have a trace running.
      await this.context.tracer?.startTrace()
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
        if (this.context.tracer) {
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

          if (this.context.tracer) {
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

    this.state = 'loading'

    try {
      await setupPage(newPageState)
    } catch (err) {
      this.state = 'uninitialized'
      throw err
    }

    this.pages.add(newPageState.page)
    this._pageState = newPageState
    this.state = 'ready'

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
    return this.startOrPreserveChain(async () => {
      this.assertReady()
      await this.context.context.addCookies([
        {
          path: '/',
          domain: await this.page.evaluate('window.location.hostname'),
          ...opts,
        },
      ])
    })
  }
  deleteCookies() {
    return this.startOrPreserveChain(async () => {
      this.assertReady()
      await this.context.context.clearCookies()
    })
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
    this.assertReady()

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

    const promise = currentPromise
      .then((value) => {
        this.assertReady()
        return nextCall(value)
      })
      .catch((reason: unknown) => {
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
