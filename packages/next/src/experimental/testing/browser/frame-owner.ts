import type { BrowserContext, Frame, Page } from 'playwright'

export interface NativeFrame {
  readonly guid: string
  readonly _id: string
  readonly _page: NativePage
  parentFrame(): NativeFrame | null
}
export interface NativePage {
  readonly guid: string
  readonly browserContext: NativeContext
  frames(): NativeFrame[]
  mainFrame(): NativeFrame
}
export interface NativeContext {
  readonly guid: string
  pages(): NativePage[]
}
export interface NativeBrowser {
  contexts(): NativeContext[]
  isConnected(): boolean
}
export interface BrowserFrameOwner {
  readonly engine: 'chromium' | 'firefox' | 'webkit'
  readonly contextGuid: string
  readonly pageGuid: string
  readonly frameGuid: string
  assertCurrent(): void
  nativeFrameId(): string
}

/** Select one actual direct child of the retained native Page. */
export function createBrowserFrameOwner(options: {
  engine: 'chromium' | 'firefox' | 'webkit'
  native: NativeBrowser
  context: BrowserContext
  page: Page
  frame: Frame
  selected: WeakMap<NativePage, NativeFrame>
  assertHost(): void
}): BrowserFrameOwner {
  const { native, context, page, frame, selected } = options
  const contextGuid = (context as BrowserContext & { _guid?: string })._guid
  const pageGuid = (page as Page & { _guid?: string })._guid
  const frameGuid = (frame as Frame & { _guid?: string })._guid
  options.assertHost()
  if (
    !native.isConnected() ||
    !contextGuid ||
    !pageGuid ||
    !frameGuid ||
    page.isClosed() ||
    page.context() !== context ||
    frame.isDetached() ||
    frame.page() !== page ||
    frame.parentFrame() !== page.mainFrame()
  )
    throw new Error('Browser test frame is outside its live browser host.')
  const contexts = native.contexts().filter((item) => item.guid === contextGuid)
  const pages =
    contexts.length === 1
      ? contexts[0].pages().filter((item) => item.guid === pageGuid)
      : []
  const frames =
    pages.length === 1
      ? pages[0].frames().filter((item) => item.guid === frameGuid)
      : []
  if (
    contexts.length !== 1 ||
    pages.length !== 1 ||
    frames.length !== 1 ||
    pages[0].browserContext !== contexts[0] ||
    frames[0]._page !== pages[0] ||
    frames[0].parentFrame() !== pages[0].mainFrame()
  )
    throw new Error(
      'Browser test frame does not match its actual native owner.'
    )
  const nativeContext = contexts[0],
    nativePage = pages[0],
    nativeFrame = frames[0]
  const nativeId = nativeFrame._id
  if (
    !nativeId ||
    (selected.has(nativePage) && selected.get(nativePage) !== nativeFrame)
  )
    throw new Error('Browser page already has a different selected test frame.')
  selected.set(nativePage, nativeFrame)
  function assertCurrent() {
    options.assertHost()
    if (
      !native.isConnected() ||
      page.isClosed() ||
      page.context() !== context ||
      frame.isDetached() ||
      frame.page() !== page ||
      frame.parentFrame() !== page.mainFrame() ||
      !native.contexts().includes(nativeContext) ||
      !nativeContext.pages().includes(nativePage) ||
      nativePage.browserContext !== nativeContext ||
      !nativePage.frames().includes(nativeFrame) ||
      nativeFrame._page !== nativePage ||
      nativeFrame.parentFrame() !== nativePage.mainFrame() ||
      nativeFrame._id !== nativeId ||
      selected.get(nativePage) !== nativeFrame
    )
      throw new Error(
        'Browser native test frame ownership is closed or changed.'
      )
  }
  return {
    engine: options.engine,
    contextGuid,
    pageGuid,
    frameGuid,
    assertCurrent,
    nativeFrameId() {
      assertCurrent()
      return nativeId
    },
  }
}
