import { BrowserFixtureError } from './context'
import type { Browser, BrowserContext, Frame, Page } from 'playwright'
import {
  createBrowserFrameOwner,
  type BrowserFrameOwner,
  type NativeBrowser,
  type NativeFrame,
  type NativePage,
} from './frame-owner'

interface BoundBrowser extends Browser {
  bind(
    title: string,
    options: { host: string; port: number }
  ): Promise<{ endpoint: string }>
  unbind(): Promise<void>
  _connection: { toImpl(browser: Browser): NativeBrowser }
}
export interface FramedBrowserHost {
  wsEndpoint: string
  dispose(): Promise<void>
  frameOwner(
    context: BrowserContext,
    page: Page,
    frame: Frame
  ): BrowserFrameOwner
}

/** Private Chromium lease; legacy launchServer callers retain their own path. */
export async function createChromiumFrameHost(
  options: { signal: AbortSignal; headless?: boolean },
  playwright: typeof import('playwright')
): Promise<FramedBrowserHost> {
  options.signal.throwIfAborted()
  let browser: BoundBrowser | undefined
  let native: NativeBrowser | undefined
  let bindingStarted = false
  let closing = false
  let disposal: Promise<void> | undefined
  const selected = new WeakMap<NativePage, NativeFrame>()
  function assertHost() {
    if (closing || !native?.isConnected())
      throw new Error('Browser frame host is closed.')
  }
  function dispose(): Promise<void> {
    closing = true
    return (disposal ??= (async () => {
      const errors: unknown[] = []
      for (const close of [
        () => (bindingStarted ? browser!.unbind() : undefined),
        () => browser?.close(),
      ]) {
        try {
          await close()
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length)
        throw new BrowserFixtureError(
          'Browser frame host cleanup failed.',
          errors
        )
    })())
  }
  try {
    browser = (await playwright.chromium.launch({
      headless: options.headless ?? true,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    })) as BoundBrowser
    options.signal.throwIfAborted()
    if (
      typeof browser.bind !== 'function' ||
      typeof browser.unbind !== 'function' ||
      typeof browser._connection?.toImpl !== 'function'
    )
      throw new Error(
        'Browser test frames require the installed SDK local browser binding.'
      )
    native = browser._connection.toImpl(browser)
    if (
      !native ||
      typeof native.contexts !== 'function' ||
      typeof native.isConnected !== 'function'
    )
      throw new Error('Browser native frame ownership is unavailable.')
    bindingStarted = true
    const bound = await browser.bind('Next test Chromium', {
      host: '127.0.0.1',
      port: 0,
    })
    options.signal.throwIfAborted()
    if (typeof bound.endpoint !== 'string' || !bound.endpoint)
      throw new Error('Browser frame binding returned no endpoint.')
    return {
      wsEndpoint: bound.endpoint,
      dispose,
      frameOwner(context, page, frame) {
        assertHost()
        return createBrowserFrameOwner({
          engine: 'chromium',
          native: native!,
          context,
          page,
          frame,
          selected,
          assertHost,
        })
      },
    }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      throw new BrowserFixtureError('Browser frame host acquisition failed.', [
        error,
        cleanupError,
      ])
    }
    throw error
  }
}
