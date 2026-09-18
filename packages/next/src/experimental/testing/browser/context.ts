import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export interface BrowserAttachment {
  name: string
  kind: 'trace' | 'screenshot'
  path: string
  contentType: string
}

export class BrowserFixtureError extends Error {
  constructor(
    message: string,
    readonly errors: unknown[]
  ) {
    super(
      `${message}: ${errors
        .map((error) =>
          error instanceof Error ? error.message : String(error)
        )
        .join('; ')}`
    )
    this.name = 'BrowserFixtureError'
  }
}

/** A context belongs to exactly one attempt, including retries and repeats. */
export interface BrowserAttempt {
  context: BrowserContext
  page: Page
  /** Idempotent. The owner must await this even after cancellation. */
  dispose(): Promise<BrowserAttachment[]>
}

/**
 * The host owns the Browser process; this lease owns only its fresh context.
 * Keeping process ownership outside the test worker lets the host close it
 * even when a test never returns or the worker crashes.
 */
export async function createBrowserAttempt(options: {
  browser: Browser
  baseURL: string
  outputDir: string
  signal: AbortSignal
  actionTimeout?: number
  onAttachment?: (attachment: BrowserAttachment) => void | Promise<void>
}): Promise<BrowserAttempt> {
  options.signal.throwIfAborted()
  await mkdir(options.outputDir, { recursive: true })
  // No test names enter filesystem paths. Parallel attempts and retries must
  // not overwrite one another's artifacts.
  const outputDir = await mkdtemp(join(resolve(options.outputDir), 'browser-'))
  const context = await options.browser.newContext({ baseURL: options.baseURL })
  const attachments: BrowserAttachment[] = []
  let tracing = false
  let page: Page | undefined
  let disposal: Promise<BrowserAttachment[]> | undefined

  function dispose(): Promise<BrowserAttachment[]> {
    return (disposal ??= (async () => {
      options.signal.removeEventListener('abort', onAbort)
      const errors: unknown[] = []
      async function capture(fn: () => Promise<void>) {
        try {
          await fn()
        } catch (error) {
          errors.push(error)
        }
      }
      async function attach(attachment: BrowserAttachment) {
        attachments.push(attachment)
        await options.onAttachment?.(attachment)
      }
      // Trace stop can fail after a browser crash. Context closure must still
      // run, and artifact errors must reach the lifecycle owner.
      await capture(async () => {
        if (page && !page.isClosed()) {
          const path = join(outputDir, 'page.png')
          await page.screenshot({ path, timeout: 5_000 })
          await attach({
            name: 'browser screenshot',
            kind: 'screenshot',
            path,
            contentType: 'image/png',
          })
        }
      })
      await capture(async () => {
        if (tracing) {
          const path = join(outputDir, 'trace.zip')
          await context.tracing.stop({ path })
          await attach({
            name: 'browser trace',
            kind: 'trace',
            path,
            contentType: 'application/zip',
          })
        }
      })
      await capture(() => context.close())
      if (errors.length) {
        throw new BrowserFixtureError('Browser fixture cleanup failed', errors)
      }
      return attachments
    })())
  }

  function onAbort() {
    // Retain the rejected promise for the awaited lifecycle teardown without
    // producing an unhandled rejection from the synchronous event listener.
    void dispose().catch(() => {})
  }

  try {
    options.signal.throwIfAborted()
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    })
    tracing = true
    page = await context.newPage()
    page.setDefaultTimeout(options.actionTimeout ?? 10_000)
    options.signal.addEventListener('abort', onAbort, { once: true })
    options.signal.throwIfAborted()
    return { context, page, dispose }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      throw new BrowserFixtureError(
        'Browser fixture setup and cleanup failed',
        [error, cleanupError]
      )
    }
    throw error
  }
}
