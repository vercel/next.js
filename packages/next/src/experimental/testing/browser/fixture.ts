import {
  createComponentMount,
  type ComponentHostConnection,
} from './component-host'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { connectBrowserHost } from './host'
import {
  createBrowserAttempt,
  BrowserFixtureError,
  type BrowserAttempt,
  type BrowserAttachment,
} from './context'

/**
 * Internal adapter for C's active attempt. I supplies the connection metadata
 * from a parent-owned host; no application server is started in this worker.
 */
export async function createBrowserFixture(options: {
  projectDir: string
  wsEndpoint: string
  baseURL: string
  outputDir: string
  componentHost?: ComponentHostConnection
  assertActiveAttempt?: () => void
  attempt: {
    signal: AbortSignal
    onCleanup(cleanup: () => Promise<void>): void
  }
  onAttachment: (attachment: BrowserAttachment) => void | Promise<void>
}): Promise<
  BrowserAttempt & {
    instant<T>(fn: () => Promise<T>): Promise<T>
    mount: ReturnType<typeof createComponentMount>['mount']
  }
> {
  options.attempt.signal.throwIfAborted()
  const requireFromProject = createRequire(
    join(options.projectDir, 'package.json')
  )
  const { instant } = requireFromProject(
    '@next/playwright'
  ) as typeof import('@next/playwright')
  const browser = await connectBrowserHost(options)
  let component: ReturnType<typeof createComponentMount> | undefined
  let resource: BrowserAttempt | undefined
  let disposal: Promise<void> | undefined
  const dispose = () =>
    (disposal ??= (async () => {
      const errors: unknown[] = []
      try {
        await resource?.dispose()
      } catch (error) {
        errors.push(error)
      }
      try {
        await browser.close()
      } catch (error) {
        errors.push(error)
      }
      // Keep page listeners installed through screenshots, traces, context
      // closure and connection closure, including their asynchronous callbacks.
      try {
        component?.dispose()
      } catch (error) {
        errors.push(error)
      }
      if (errors.length) {
        throw new BrowserFixtureError('Browser fixture disposal failed', errors)
      }
    })())

  try {
    // Register the connection before creating pages. A timeout during setup
    // must still disconnect it, and a sealed attempt rejects registration.
    options.attempt.onCleanup(dispose)
    options.attempt.signal.throwIfAborted()
    resource = await createBrowserAttempt({
      browser,
      baseURL: options.baseURL,
      outputDir: options.outputDir,
      signal: options.attempt.signal,
      onAttachment: options.onAttachment,
    })
    const page = resource.page
    component = createComponentMount({
      page,
      baseURL: options.baseURL,
      host: options.componentHost,
      signal: options.attempt.signal,
      assertActiveAttempt:
        options.assertActiveAttempt ??
        (() => options.attempt.signal.throwIfAborted()),
    })
    return {
      ...resource,
      mount: component.mount,
      instant: (fn) => instant(page, fn, { baseURL: options.baseURL }),
    }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      throw new BrowserFixtureError('Browser fixture acquisition failed', [
        error,
        cleanupError,
      ])
    }
    throw error
  }
}
