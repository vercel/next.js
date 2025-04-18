import { chromium, webkit, firefox, Browser } from 'playwright'
import { Playwright } from '../playwright'
import { TimeoutGroup } from './timeout-group'
import { Closable, Closer } from './closable'
import { BrowserContextWrapper } from './playwright-context-wrapper'
import {
  debugConsole,
  maxBrowserCleanupDuration,
  maxCleanupDuration,
} from './common'

export type BrowserOptions = {
  browserName: string
  headless: boolean
  enableTracing: boolean
}

export type BrowserContextOptions = {
  /**
   * browser locale
   */
  locale: string | undefined
  javaScriptEnabled: boolean
  /**
   * ignore https errors
   */
  ignoreHTTPSErrors: boolean | undefined
  /**
   * Override the user agent
   */
  userAgent: string | undefined
  deviceName: string | undefined
}

const DEFAULT_BROWSER_OPTIONS: BrowserOptions = {
  browserName: process.env.BROWSER_NAME || 'chrome',
  headless: !!process.env.HEADLESS,
  enableTracing: !!process.env.TRACE_PLAYWRIGHT,
}

const DEFAULT_CONTEXT_OPTIONS: BrowserContextOptions = {
  locale: undefined, // TODO: pick a default value?
  javaScriptEnabled: true,
  ignoreHTTPSErrors: false,
  userAgent: undefined,
  deviceName: process.env.DEVICE_NAME || undefined,
}

export class PlaywrightManager implements Closable {
  closer: Closer

  sharedState: SharedPlaywrightState | null = null
  nextInstanceId: number = 1
  instances = new Set<Playwright>()

  constructor() {
    this.closer = new Closer(this)
  }

  static resolveBrowserOptions(
    partial: Partial<BrowserOptions>
  ): BrowserOptions {
    const resolved: Partial<BrowserOptions> = {}
    for (const key in DEFAULT_BROWSER_OPTIONS) {
      resolved[key] = partial[key] ?? DEFAULT_BROWSER_OPTIONS[key]
    }
    return resolved as BrowserOptions
  }

  static resolveContextOptions(
    partial: Partial<BrowserContextOptions>
  ): BrowserContextOptions {
    const resolved: Partial<BrowserContextOptions> = {}
    for (const key in DEFAULT_CONTEXT_OPTIONS) {
      resolved[key] = partial[key] ?? DEFAULT_CONTEXT_OPTIONS[key]
    }
    return resolved as BrowserContextOptions
  }

  async createInstance(
    mixedOptions: Partial<BrowserOptions & BrowserContextOptions> & {
      createSecondaryInstance: boolean
    }
  ) {
    const { createSecondaryInstance } = mixedOptions
    const browserOptions = PlaywrightManager.resolveBrowserOptions(mixedOptions)
    const contextOptions = PlaywrightManager.resolveContextOptions(mixedOptions)

    if (this.instances.size > 0 && !createSecondaryInstance) {
      // the previous browser will be cleaned up after the current test
      // (or by manually calling `browser.close()` in legacy tests),
      // so we don't need to do any cleanup here
      throw new Error(
        'Calling `next.browser()` multiple times in a single test is not recommended. ' +
          'If you need to navigate to a new page, use `browser.get(path)` instead. \n' +
          'If you REALLY need multiple browsers running in parallel, pass `inefficientlyCreateAdditionalBrowserInstance: true` when creating the second browser.'
      )
    } else if (this.instances.size === 0 && createSecondaryInstance) {
      throw new Error(
        '`inefficientlyCreateAdditionalBrowserInstance: true` can only be passed to the second browser created within a test.'
      )
    }

    let context: BrowserContextWrapper
    if (!this.sharedState) {
      this.sharedState = await SharedPlaywrightState.create(
        browserOptions,
        contextOptions,
        this
      )
      context = this.sharedState.defaultContext!
    } else {
      if (createSecondaryInstance) {
        // this would force us to recreate sharedState
        if (!this.sharedState.canReuseBrowser(browserOptions)) {
          throw new Error(
            `Changing the following options for a secondary browser is not supported: ${Object.keys(
              browserOptions
            )
              .map((name) => JSON.stringify(name))
              .join(', ')}`
          )
        }
        context =
          await this.sharedState.createSecondaryBrowserContext(contextOptions)
      } else {
        if (this.sharedState.canReuseBrowser(browserOptions)) {
          context =
            await this.sharedState.updateDefaultBrowserContext(contextOptions)
        } else {
          await TimeoutGroup.with(
            {
              description:
                'closing the previous browser before creating a new playwright instance',
              maxDuration: maxBrowserCleanupDuration,
            },
            () => this.sharedState!.close()
          )

          this.sharedState = await SharedPlaywrightState.create(
            browserOptions,
            contextOptions,
            this
          )
          context = this.sharedState.defaultContext!
        }
      }
    }

    const instanceName = this.createInstanceName(browserOptions, contextOptions)
    const instance = new Playwright(context, instanceName)

    this.instances.add(instance)

    return instance
  }

  async closeWithReason(reason: string) {
    await TimeoutGroup.with(
      {
        description: reason,
        maxDuration: maxBrowserCleanupDuration,
      },
      async () => {
        await this.close()
      }
    )
  }

  async close() {}

  async closeInstance(instance: Playwright, reason: string) {
    this.instances.delete(instance)

    const group = TimeoutGroup.getIfAvailable()
    if (!group) {
      await TimeoutGroup.with(
        {
          description: reason,
          maxDuration: maxCleanupDuration,
        },
        () => instance.close()
      )
    } else {
      await group.wait(reason, () => instance.close())
    }
  }

  private createInstanceName(
    browserOptions: BrowserOptions,
    contextOptions: BrowserContextOptions
  ) {
    const name = `#${this.nextInstanceId++}`

    const parts = [browserOptions.browserName]
    for (const [actual, defaults] of [
      [browserOptions, DEFAULT_BROWSER_OPTIONS],
      [contextOptions, DEFAULT_CONTEXT_OPTIONS],
    ]) {
      for (const key in actual) {
        const value = actual[key]
        if (value !== defaults[key]) {
          parts.push(`${key}: ${value}`)
        }
      }
    }

    return `${name} (${parts.join(', ')})`
  }
}

class SharedPlaywrightState implements Closable {
  public closer: Closer

  private constructor(
    public browser: Browser,
    public browserOptions: BrowserOptions,
    owner: Closable
  ) {
    this.closer = new Closer(this, owner)
  }

  public defaultContext: BrowserContextWrapper | null
  private secondaryContexts = new Set<BrowserContextWrapper>()

  static async create(
    browserOptions: BrowserOptions,
    contextOptions: BrowserContextOptions,
    owner: Closable
  ): Promise<SharedPlaywrightState> {
    const { browserName, headless } = browserOptions
    const label = '[playwright] creating new browser context'
    debugConsole?.time(label)
    const browser = await launchBrowser(browserName, { headless })
    debugConsole?.timeEnd(label)
    const sharedState = new SharedPlaywrightState(
      browser,
      browserOptions,
      owner
    )
    sharedState.defaultContext =
      await sharedState.createBrowserContext(contextOptions)

    return sharedState
  }

  public async createSecondaryBrowserContext(options: BrowserContextOptions) {
    const context = await this.createBrowserContext(options)
    this.secondaryContexts.add(context)
    return context
  }

  private async createBrowserContext(options: BrowserContextOptions) {
    const context = await BrowserContextWrapper.create(
      this.browser,
      options,
      this.browserOptions.enableTracing,
      this
    )
    context.closer.onClose(() => {
      if (this.defaultContext === context) {
        this.defaultContext = null
      } else if (this.secondaryContexts.has(context)) {
        this.secondaryContexts.delete(context)
      }
    })
    return context
  }

  canReuseBrowser(browserOptions: BrowserOptions) {
    // if a browser configuration option changed, we have to recreate the whole state.
    return !SharedPlaywrightState.optionChanged(
      this.browserOptions,
      browserOptions
    )
  }

  async updateDefaultBrowserContext(
    newOptions: BrowserContextOptions
  ): Promise<BrowserContextWrapper> {
    // if a browser context configuration option changed, we have to recreate the context.
    if (
      SharedPlaywrightState.optionChanged(
        this.defaultContext!.options,
        newOptions
      )
    ) {
      const oldDefaultContext = this.defaultContext
      this.defaultContext = null
      await TimeoutGroup.with(
        {
          description:
            'closing the previous default browser context before creating a new one',
          maxDuration: maxCleanupDuration,
        },
        () => oldDefaultContext!.close()
      )

      this.defaultContext = await this.createBrowserContext(newOptions)
      return this.defaultContext
    } else {
      await this.defaultContext!.reuse()
      return this.defaultContext!
    }
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
    const group = TimeoutGroup.get()
    try {
      await group.wait('shutting down the Playwright browser instance', () =>
        this.browser.close()
      )
    } finally {
      this.browser = null!
    }
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
