import { createRequire } from 'node:module'
import { join } from 'node:path'
import type {
  Browser,
  BrowserContext,
  BrowserServer,
  Frame,
  Page,
} from 'playwright'
import { BrowserFixtureError } from './context'
import type { WebKitPageOwner } from './webkit-host'
import type { FirefoxPageOwner, FirefoxFrameOwner } from './firefox-host'
import type { BrowserFrameOwner } from './frame-owner'

function loadPlaywright(projectDir: string): typeof import('playwright') {
  // Resolve the user's optional browser dependency without starting Playwright
  // Test, Vitest, or a Vite server.
  const requireFromProject = createRequire(join(projectDir, 'package.json'))
  return requireFromProject('playwright')
}

export interface BrowserHost {
  wsEndpoint: string
  dispose(): Promise<void>
  frameOwner?(
    context: BrowserContext,
    page: Page,
    frame: Frame
  ): BrowserFrameOwner | FirefoxFrameOwner
  webKitPageOwner?(context: BrowserContext, page: Page): WebKitPageOwner
  firefoxPageOwner?(context: BrowserContext, page: Page): FirefoxPageOwner
}

/**
 * Acquire in the coordinator, never in an execution worker. The signal only
 * cancels acquisition; the returned lease survives until the parent disposes
 * it after the driver has closed, allowing the driver to finish its cleanup.
 */
export async function createBrowserHost(options: {
  projectDir: string
  signal: AbortSignal
  engine?: 'chromium' | 'webkit' | 'firefox'
  headless?: boolean
  ownedFrames?: boolean
}): Promise<BrowserHost> {
  options.signal.throwIfAborted()
  if (options.engine === 'firefox') {
    const { createFirefoxBrowserHost } = await import('./firefox-host.js')
    return createFirefoxBrowserHost(options, loadPlaywright(options.projectDir))
  }
  if (options.engine === 'webkit') {
    const { createWebKitBrowserHost } = await import('./webkit-host.js')
    return createWebKitBrowserHost(options, loadPlaywright(options.projectDir))
  }
  if (options.ownedFrames) {
    const { createChromiumFrameHost } = await import('./frame-host.js')
    return createChromiumFrameHost(options, loadPlaywright(options.projectDir))
  }
  const server: BrowserServer = await loadPlaywright(
    options.projectDir
  ).chromium.launchServer({
    host: '127.0.0.1',
    headless: options.headless ?? true,
    // Next owns cancellation, driver shutdown, and terminal reporting.
    // Playwright's default SIGINT handler exits the coordinator before those
    // steps finish; its TERM/HUP handlers also close the browser too early.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  })
  let disposal: Promise<void> | undefined
  function dispose() {
    return (disposal ??= (async () => {
      await server.close()
    })())
  }
  if (options.signal.aborted) {
    try {
      await dispose()
    } catch (error) {
      throw new BrowserFixtureError('Browser host acquisition cancelled', [
        options.signal.reason,
        error,
      ])
    }
    options.signal.throwIfAborted()
  }
  return { wsEndpoint: server.wsEndpoint(), dispose }
}

/** The worker closes its connection; the coordinator owns the actual process. */
export async function connectBrowserHost(options: {
  projectDir: string
  wsEndpoint: string
  timeout?: number
  engine?: 'chromium' | 'webkit' | 'firefox'
  beforeConnect?: (playwright: typeof import('playwright')) => Promise<void>
}): Promise<Browser> {
  const playwright = loadPlaywright(options.projectDir)
  if (options.beforeConnect) await options.beforeConnect(playwright)
  if (options.engine === 'firefox')
    return playwright.firefox.connect(options.wsEndpoint, {
      timeout: options.timeout,
    })
  if (options.engine === 'webkit')
    return playwright.webkit.connect(options.wsEndpoint, {
      timeout: options.timeout,
    })
  return playwright.chromium.connect(options.wsEndpoint, {
    timeout: options.timeout,
  })
}
