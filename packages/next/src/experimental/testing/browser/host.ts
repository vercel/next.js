import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Browser, BrowserServer } from 'playwright'
import { BrowserFixtureError } from './context'

function loadPlaywright(projectDir: string): typeof import('playwright') {
  // Resolve the user's optional browser dependency without starting Playwright
  // Test, Vitest, or a Vite server.
  const requireFromProject = createRequire(join(projectDir, 'package.json'))
  return requireFromProject('playwright')
}

export interface BrowserHost {
  wsEndpoint: string
  dispose(): Promise<void>
}

/**
 * Acquire in the coordinator, never in an execution worker. The signal only
 * cancels acquisition; the returned lease survives until the parent disposes
 * it after the driver has closed, allowing the driver to finish its cleanup.
 */
export async function createBrowserHost(options: {
  projectDir: string
  signal: AbortSignal
}): Promise<BrowserHost> {
  options.signal.throwIfAborted()
  const server: BrowserServer = await loadPlaywright(
    options.projectDir
  ).chromium.launchServer({
    host: '127.0.0.1',
    headless: true,
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
}): Promise<Browser> {
  return loadPlaywright(options.projectDir).chromium.connect(options.wsEndpoint)
}
