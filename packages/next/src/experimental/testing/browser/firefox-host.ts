import { createBrowserFrameOwner, type NativeFrame } from './frame-owner'
import type { Frame } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { createConnection, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, BrowserContext, Page } from 'playwright'
import { BrowserFixtureError } from './context'
import type { BrowserHost } from './host'

/** Packets are issued by the owned Gecko debugger transport. */
export interface FirefoxRdpPacket {
  from: string
  type?: string
  [key: string]: any
}

export interface FirefoxRdpConnection {
  request(to: string, type: string, fields?: object): Promise<FirefoxRdpPacket>
  onPacket(listener: (packet: FirefoxRdpPacket) => boolean): () => void
  onClosed(listener: (error: Error) => void): () => void
  dispose(): Promise<void>
}

/** RDP replies have actor FIFO ordering; its unsolicited events are separate. */
export async function connectFirefoxRdp(
  path: string,
  signal: AbortSignal
): Promise<FirefoxRdpConnection> {
  signal.throwIfAborted()
  const socket: Socket = createConnection(path)
  let buffer = Buffer.alloc(0)
  let closed = false
  let closing = false
  let failure: Error | undefined
  let disposal: Promise<void> | undefined
  const requests = new Map<
    string,
    {
      type: string
      resolve(packet: FirefoxRdpPacket): void
      reject(error: Error): void
    }[]
  >()
  const listeners = new Set<(packet: FirefoxRdpPacket) => boolean>()
  const closedListeners = new Set<(error: Error) => void>()
  let greet!: () => void
  let refuseGreeting!: (error: Error) => void
  const greeting = new Promise<void>((resolve, reject) => {
    greet = resolve
    refuseGreeting = reject
  })
  let finished!: () => void
  const finishedClosing = new Promise<void>((resolve) => {
    finished = resolve
  })
  function fail(error: Error) {
    if (failure) return
    failure = error
    refuseGreeting(error)
    for (const pending of requests.values())
      for (const entry of pending) entry.reject(error)
    requests.clear()
    for (const listener of closedListeners) listener(error)
    socket.destroy()
  }
  function request(
    to: string,
    type: string,
    fields: object = {}
  ): Promise<FirefoxRdpPacket> {
    if (closed || closing || failure)
      return Promise.reject(failure ?? new Error('Firefox debugger is closed.'))
    return new Promise((resolve, reject) => {
      const pending = requests.get(to) ?? []
      pending.push({ type, resolve, reject })
      requests.set(to, pending)
      const bytes = Buffer.from(JSON.stringify({ to, type, ...fields }))
      socket.write(
        Buffer.concat([Buffer.from(bytes.length + ':'), bytes]),
        (error) => {
          if (error) fail(error)
        }
      )
    })
  }
  function consume(packet: FirefoxRdpPacket) {
    if (packet.applicationType === 'browser') {
      greet()
      return
    }
    const pending = requests.get(packet.from)
    // Thread lifecycle events precede their method's separate empty reply.
    // Consuming an event here would shift a later reply into the next request.
    const reply =
      !packet.type ||
      packet.error ||
      // FrameActor has no events; getEnvironment returns its typed form.
      pending?.[0]?.type === 'getEnvironment'
    if (reply) {
      const next = pending?.shift()
      if (!pending?.length) requests.delete(packet.from)
      if (next) {
        if (packet.error)
          next.reject(
            new Error('Firefox debugger request failed: ' + packet.message)
          )
        else next.resolve(packet)
      }
      return
    }
    let handled = false
    for (const listener of listeners) handled = listener(packet) || handled
    if (packet.type === 'paused' && !handled)
      void request(packet.from, 'resume').catch(() => {})
  }
  socket.on('data', (chunk: Buffer) => {
    try {
      buffer = Buffer.concat([buffer, chunk])
      while (true) {
        const colon = buffer.indexOf(58)
        if (colon < 0) return
        const length = Number(buffer.subarray(0, colon).toString())
        if (!Number.isSafeInteger(length) || length <= 0)
          throw new Error('Invalid Firefox debugger packet length.')
        if (buffer.length < colon + 1 + length) return
        const packet = JSON.parse(
          buffer.subarray(colon + 1, colon + 1 + length).toString()
        )
        buffer = buffer.subarray(colon + 1 + length)
        if (!packet || typeof packet.from !== 'string')
          throw new Error('Invalid Firefox debugger actor.')
        consume(packet)
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  })
  socket.on('error', fail)
  socket.once('close', () => {
    closed = true
    fail(new Error('Firefox debugger disconnected.'))
    finished()
  })
  const abort = () => fail(new Error('Firefox debugger acquisition cancelled.'))
  signal.addEventListener('abort', abort, { once: true })
  function dispose() {
    return (disposal ??= (async () => {
      closing = true
      fail(new Error('Firefox debugger closed by its owner.'))
      await finishedClosing
      listeners.clear()
      closedListeners.clear()
    })())
  }
  try {
    await greeting
    signal.throwIfAborted()
    return {
      request,
      onPacket(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      onClosed(listener) {
        closedListeners.add(listener)
        return () => {
          closedListeners.delete(listener)
        }
      },
      dispose,
    }
  } catch (error) {
    await dispose()
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

interface NativeContext {
  guid: string
  pages(): NativePage[]
}
interface NativePage {
  guid: string
  browserContext: NativeContext
  initScripts: { source: string }[]
  mainFrame(): NativeFrame
  frames(): NativeFrame[]
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

export interface FirefoxPageOwner {
  readonly rdp: FirefoxRdpConnection
  readonly pageGuid: string
  readonly contextGuid: string
  assertCurrent(): void
  browserId(): number
  initializerSource(source: string): string
  openNativeSession(signal: AbortSignal): Promise<FirefoxRdpConnection>
}

export interface FirefoxFrameOwner extends FirefoxPageOwner {
  readonly engine: 'firefox'
  readonly frameGuid: string
  nativeFrameId(): string
  browsingContextId(): number
}

/** A local SDK owner retains both Juggler and Gecko's debugger connection. */
export async function createFirefoxBrowserHost(
  options: { signal: AbortSignal; headless?: boolean },
  playwright: typeof import('playwright')
): Promise<BrowserHost> {
  options.signal.throwIfAborted()
  // Keep the socket short enough for Darwin's Unix-domain address limit.
  const directory = await mkdtemp(join(tmpdir(), 'ntf-'))
  const socketPath = join(directory, 'rdp')
  let browser: BoundBrowser | undefined
  let native: NativeBrowser | undefined
  let rdp: FirefoxRdpConnection | undefined
  let bindingStarted = false
  let closing = false
  let disposal: Promise<void> | undefined
  const selected = new WeakMap<NativePage, NativeFrame>()
  const auxiliary = new Set<FirefoxRdpConnection>()
  const acquiring = new Set<Promise<FirefoxRdpConnection>>()
  const auxiliaryLifetime = new AbortController()
  function dispose(): Promise<void> {
    return (disposal ??= (async () => {
      closing = true
      auxiliaryLifetime.abort(new Error('Firefox browser host is closing.'))
      const errors: unknown[] = []
      for (const close of [
        async () => {
          await Promise.allSettled([...acquiring])
          const results = await Promise.allSettled(
            [...auxiliary].map((session) => session.dispose())
          )
          auxiliary.clear()
          for (const result of results)
            if (result.status === 'rejected') errors.push(result.reason)
        },
        () => rdp?.dispose(),
        () => (bindingStarted ? browser!.unbind() : undefined),
        () => browser?.close(),
        () => rm(directory, { recursive: true, force: true }),
      ]) {
        try {
          await close()
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length)
        throw new BrowserFixtureError(
          'Firefox browser host cleanup failed',
          errors
        )
    })())
  }
  function firefoxPageOwner(
    context: BrowserContext,
    page: Page
  ): FirefoxPageOwner {
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
      throw new Error('Firefox page is outside its live browser host.')
    const contexts = native
      .contexts()
      .filter((item) => item.guid === contextGuid)
    const pages =
      contexts.length === 1
        ? contexts[0].pages().filter((item) => item.guid === pageGuid)
        : []
    if (pages.length !== 1 || pages[0].browserContext !== contexts[0])
      throw new Error('Firefox page does not match its actual native owner.')
    const nativeContext = contexts[0],
      nativePage = pages[0]
    function assertCurrent() {
      if (
        closing ||
        !native!.isConnected() ||
        page.isClosed() ||
        page.context() !== context ||
        !native!.contexts().includes(nativeContext) ||
        !nativeContext.pages().includes(nativePage) ||
        nativePage.browserContext !== nativeContext
      )
        throw new Error('Firefox native page ownership is closed or changed.')
    }
    return {
      rdp: rdp!,
      pageGuid,
      contextGuid,
      assertCurrent,
      browserId() {
        assertCurrent()
        // Gecko Juggler derives its top-frame ID from browsingContext.browserId.
        const match = /^mainframe-([1-9]\d*)$/.exec(nativePage.mainFrame()._id)
        const id = match && Number(match[1])
        if (!id || !Number.isSafeInteger(id))
          throw new Error('Firefox native owner has no actual browser ID.')
        return id
      },
      initializerSource(source) {
        assertCurrent()
        const matches = nativePage.initScripts?.filter(
          (script) =>
            typeof script.source === 'string' && script.source.includes(source)
        )
        if (matches?.length !== 1)
          throw new Error(
            'Firefox initializer does not match its actual SDK owner.'
          )
        return matches[0].source
      },
      openNativeSession(signal) {
        assertCurrent()
        const operation = (async () => {
          const session = await connectFirefoxRdp(
            socketPath,
            AbortSignal.any([signal, auxiliaryLifetime.signal])
          )
          if (closing || signal.aborted) {
            await session.dispose()
            throw new Error('Firefox native session acquisition cancelled.')
          }
          auxiliary.add(session)
          return {
            ...session,
            async dispose() {
              try {
                await session.dispose()
              } finally {
                auxiliary.delete(session)
              }
            },
          }
        })()
        acquiring.add(operation)
        void operation
          .finally(() => acquiring.delete(operation))
          .catch(() => {})
        return operation
      },
    }
  }
  function frameOwner(
    context: BrowserContext,
    page: Page,
    frame: Frame
  ): FirefoxFrameOwner {
    const pageOwner = firefoxPageOwner(context, page)
    const selectedFrame = createBrowserFrameOwner({
      engine: 'firefox',
      native: native!,
      context,
      page,
      frame,
      selected,
      assertHost() {
        if (closing || !native?.isConnected())
          throw new Error('Firefox frame host is closed.')
      },
    })
    return {
      ...pageOwner,
      ...selectedFrame,
      engine: 'firefox',
      browsingContextId() {
        const match = /^subframe-([1-9]\d*)$/.exec(
          selectedFrame.nativeFrameId()
        )
        const id = match && Number(match[1])
        if (!id || !Number.isSafeInteger(id))
          throw new Error(
            'Firefox test frame has no actual BrowsingContext ID.'
          )
        return id
      },
    }
  }
  try {
    browser = (await playwright.firefox.launch({
      headless: options.headless ?? true,
      args: ['--start-debugger-server', socketPath],
      firefoxUserPrefs: {
        'devtools.debugger.remote-enabled': true,
        'devtools.debugger.prompt-connection': false,
        'devtools.debugger.force-local': true,
      },
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
        'Firefox requires the installed SDK local browser binding.'
      )
    native = browser._connection.toImpl(browser)
    if (
      !native ||
      typeof native.contexts !== 'function' ||
      typeof native.isConnected !== 'function'
    )
      throw new Error('Firefox native browser ownership is unavailable.')
    rdp = await connectFirefoxRdp(socketPath, options.signal)
    bindingStarted = true
    const bound = await browser.bind('Next test Firefox', {
      host: '127.0.0.1',
      port: 0,
    })
    options.signal.throwIfAborted()
    if (typeof bound.endpoint !== 'string' || !bound.endpoint)
      throw new Error('Firefox browser binding returned no endpoint.')
    return { wsEndpoint: bound.endpoint, dispose, firefoxPageOwner, frameOwner }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      throw new BrowserFixtureError('Firefox browser host acquisition failed', [
        error,
        cleanupError,
      ])
    }
    throw error
  }
}
