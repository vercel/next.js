import { Browser, BrowserContext, Page, devices } from 'playwright'
import { TimeoutGroup } from './timeout-group'
import { dedupeWhilePending } from './dedupe-while-pending'
import { Closable, Closer } from './closable'
import { PlaywrightObjectDisposer } from './playwright-object-disposer'
import { PlaywrightTracer } from './playwright-tracer'
import { BrowserContextOptions } from './playwright-manager'
import { debugConsole } from './common'

export class BrowserContextWrapper implements Closable {
  closer: Closer
  private objectDisposer: PlaywrightObjectDisposer

  private state: 'ready' | 'reset' | 'closed' = 'ready'

  private constructor(
    public context: BrowserContext,
    public options: BrowserContextOptions,
    tracer: PlaywrightTracer | null,
    owner: Closable
  ) {
    this.closer = new Closer(this, owner)
    this.tracer = tracer
    this.objectDisposer = new PlaywrightObjectDisposer(context)
  }

  isClosed() {
    const result = this.closer.isClosed()
    if (result && this.state !== 'closed') {
      throw new Error(`Invariant: closer is closed, but state is ${this.state}`)
    }
    return result
  }

  isReset() {
    return this.state === 'reset'
  }

  public tracer: PlaywrightTracer | null

  static async create(
    browser: Browser,
    options: BrowserContextOptions,
    tracingEnabled: boolean,
    owner: Closable
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

    const label = '[playwright] creating new browser context'
    debugConsole?.time(label)
    const context = await browser.newContext({
      locale,
      javaScriptEnabled,
      ignoreHTTPSErrors,
      ...(userAgent ? { userAgent } : {}),
      ...device,
    })
    debugConsole?.timeEnd(label)

    const wrapper = new BrowserContextWrapper(context, options, null, owner)
    if (tracingEnabled) {
      const tracer = new PlaywrightTracer(wrapper)
      wrapper.tracer = tracer
      await tracer.start()
    }

    return wrapper
  }

  private resetting = dedupeWhilePending()

  async reset() {
    debugConsole?.log(
      `[playwright] resetting browser context (state: ${this.state})`
    )
    await this.resetting
      .run(async () => {
        if (this.isClosed()) {
          throw new Error('Cannot reset a browser context that was closed')
        }
        if (this.state === 'reset') {
          return
        }
        this.state = 'reset'
        await this.closeAllPages()
        await this.cleanupBrowserContext()
      })
      .then(
        () => {
          debugConsole?.log(
            `[playwright] resetting browser succeeded (state: ${this.state})`
          )
        },
        (err) => {
          debugConsole?.log(
            `[playwright] resetting browser failed (state: ${this.state})`,
            err
          )
          throw err
        }
      )
  }

  async closeAllPages() {
    await Promise.all(this.context.pages().map((page) => this.closePage(page)))
  }

  async cleanupBrowserContext() {
    if (this.isClosed()) return

    const context = this.context
    if (this.objectDisposer.isClosed(context)) {
      return
    }

    const group = TimeoutGroup.get()
    // Clean up the existing browser context as best we can.
    const disposers = this.objectDisposer.getForceableDisposers(context)
    await Promise.all([
      group.forceIfTimeout(
        'removing browser context event listeners',
        disposers.removeAllListeners
      ),
      group.forceIfTimeout(
        'removing request interceptors defined with `context.route()`',
        disposers.unrouteAll
      ),
      group.wait('cookies', () => context.clearCookies()),
      group.wait('permissions', () => context.clearPermissions()),
    ])
  }

  async reuse() {
    debugConsole?.log('[playwright] reusing browser context')
    if (this.isClosed()) {
      throw new Error('Cannot reuse a browser context that was closed')
    }
    await this.reset()
    this.state = 'ready'
  }

  async close() {
    debugConsole?.log(
      `[playwright] closing browser context (state: ${this.state})`
    )
    const group = TimeoutGroup.get()
    try {
      // this can hang because of an unresolved request interceptor.
      await group.wait('cleaning up the browser context', () => this.reset())

      await group.wait('closing the browser context', () =>
        this.objectDisposer.close(this.context)
      )
    } finally {
      debugConsole?.log('[playwright] marking browser context as closed')
      this.state = 'closed'
    }
  }

  async closePage(page: Page) {
    const shouldRun = () =>
      !page.isClosed() && !this.objectDisposer.isClosed(this.context)

    if (!shouldRun()) return

    const group = TimeoutGroup.get()
    const disposers = this.objectDisposer.getForceableDisposers(page)

    await Promise.all([
      group.forceIfTimeout(
        'removing Page event listeners',
        disposers.removeAllListeners
      ),
      group.forceIfTimeout(
        'removing Request interceptors defined with `page.route()`',
        disposers.unrouteAll
      ),
    ])

    await group.wait('closing page', () => this.objectDisposer.close(page))
  }
}
