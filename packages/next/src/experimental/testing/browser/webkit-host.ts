import type { Browser, BrowserContext, Frame, Page } from 'playwright'
import type { BrowserHost } from './host'
import { BrowserFixtureError } from './context'
import {
  createBrowserFrameOwner,
  type NativeFrame,
  type NativePage as NativeFramePage,
} from './frame-owner'

/** The actual shared page session remains owned by the installed SDK. */
export interface WebKitPageSession {
  send(method: string, params?: object): Promise<any>
  on(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
  isDisposed(): boolean
}

interface NativeContext {
  guid: string
  pages(): NativePage[]
}
interface NativePage extends NativeFramePage {
  browserContext: NativeContext
  delegate: {
    _session: WebKitPageSession
    _calculateBootstrapScript(): string
  }
}
interface NativeBrowser {
  contexts(): NativeContext[]
  isConnected(): boolean
}
interface BoundBrowser extends Browser {
  bind(
    title: string,
    options: { host: string; port: number }
  ): Promise<{ endpoint: string }>
  unbind(): Promise<void>
  _connection: { toImpl(browser: Browser): NativeBrowser }
}

export interface WebKitPageOwner {
  readonly session: WebKitPageSession
  readonly pageGuid: string
  readonly contextGuid: string
  assertCurrent(): void
  mainFrameId(): string
  bootstrapSource(): string
}

/** The local launch owner and the remote driver share this one native browser. */
export async function createWebKitBrowserHost(
  options: { signal: AbortSignal; headless?: boolean },
  playwright: typeof import('playwright')
): Promise<BrowserHost> {
  options.signal.throwIfAborted()
  let browser: BoundBrowser | undefined
  let native: NativeBrowser | undefined
  let bindingStarted = false
  let closing = false
  let disposal: Promise<void> | undefined
  const selected = new WeakMap<NativeFramePage, NativeFrame>()
  function dispose(): Promise<void> {
    return (disposal ??= (async () => {
      closing = true
      const errors: unknown[] = []
      if (bindingStarted) {
        try {
          await browser!.unbind()
        } catch (error) {
          errors.push(error)
        }
      }
      try {
        await browser?.close()
      } catch (error) {
        errors.push(error)
      }
      if (errors.length)
        throw new BrowserFixtureError(
          'WebKit browser host cleanup failed',
          errors
        )
    })())
  }
  function frameOwner(context: BrowserContext, page: Page, frame: Frame) {
    webKitPageOwner(context, page).assertCurrent()
    return createBrowserFrameOwner({
      engine: 'webkit',
      native: native!,
      context,
      page,
      frame,
      selected,
      assertHost() {
        if (closing || !native?.isConnected())
          throw new Error('WebKit frame host is closed.')
      },
    })
  }
  function webKitPageOwner(
    context: BrowserContext,
    page: Page
  ): WebKitPageOwner {
    const contextGuid = (context as BrowserContext & { _guid?: string })._guid
    const pageGuid = (page as Page & { _guid?: string })._guid
    if (
      closing ||
      !native?.isConnected() ||
      !contextGuid ||
      !pageGuid ||
      page.isClosed() ||
      page.context() !== context
    )
      throw new Error('WebKit page is outside its live browser host.')
    const contexts = native
      .contexts()
      .filter((item) => item.guid === contextGuid)
    const pages =
      contexts.length === 1
        ? contexts[0].pages().filter((item) => item.guid === pageGuid)
        : []
    if (pages.length !== 1 || pages[0].browserContext !== contexts[0])
      throw new Error('WebKit page does not match its actual native owner.')
    const nativeContext = contexts[0]
    const nativePage = pages[0]
    const session = nativePage.delegate?._session
    if (
      !session ||
      typeof session.send !== 'function' ||
      typeof session.on !== 'function' ||
      typeof session.off !== 'function' ||
      typeof session.isDisposed !== 'function' ||
      typeof nativePage.delegate._calculateBootstrapScript !== 'function'
    )
      throw new Error('WebKit native page session is unavailable.')
    function assertCurrent() {
      if (
        closing ||
        !native!.isConnected() ||
        page.isClosed() ||
        page.context() !== context ||
        !native!.contexts().includes(nativeContext) ||
        !nativeContext.pages().includes(nativePage) ||
        nativePage.browserContext !== nativeContext ||
        nativePage.delegate._session !== session ||
        session.isDisposed()
      )
        throw new Error('WebKit native page ownership is closed or changed.')
    }
    assertCurrent()
    return {
      session,
      pageGuid,
      contextGuid,
      assertCurrent,
      mainFrameId() {
        assertCurrent()
        const id = nativePage.mainFrame()._id
        if (!id) throw new Error('WebKit owner has no actual main frame.')
        return id
      },
      bootstrapSource() {
        assertCurrent()
        const source = nativePage.delegate._calculateBootstrapScript()
        if (typeof source !== 'string' || !source)
          throw new Error('WebKit owner has no actual bootstrap script.')
        return source
      },
    }
  }
  try {
    browser = (await playwright.webkit.launch({
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
        'WebKit requires the installed SDK local browser binding.'
      )
    native = browser._connection.toImpl(browser)
    if (
      !native ||
      typeof native.contexts !== 'function' ||
      typeof native.isConnected !== 'function'
    )
      throw new Error('WebKit native browser ownership is unavailable.')
    bindingStarted = true
    const bound = await browser.bind('Next test WebKit', {
      host: '127.0.0.1',
      port: 0,
    })
    options.signal.throwIfAborted()
    if (typeof bound.endpoint !== 'string' || !bound.endpoint)
      throw new Error('WebKit browser binding returned no endpoint.')
    return { wsEndpoint: bound.endpoint, dispose, webKitPageOwner, frameOwner }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      throw new BrowserFixtureError('WebKit browser host acquisition failed', [
        error,
        cleanupError,
      ])
    }
    throw error
  }
}
