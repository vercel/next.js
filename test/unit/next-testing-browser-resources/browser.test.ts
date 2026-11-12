import { createServer as createNetServer } from 'node:net'
import { createComponentMount } from 'next/dist/experimental/testing/browser/component-host'
import { createServer, type Server } from 'node:http'
import { mkdtemp, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Browser } from 'playwright'
import { instant } from '@next/playwright'
import {
  createBrowserHost,
  connectBrowserHost,
  type BrowserHost,
} from 'next/dist/experimental/testing/browser/host'
import {
  createBrowserAttempt,
  BrowserFixtureError,
  type BrowserAttempt,
} from 'next/dist/experimental/testing/browser/context'
import { createBrowserFixture } from 'next/dist/experimental/testing/browser/fixture'
import {
  browser as getBrowserFixture,
  initializeBrowserTesting,
} from 'next/dist/experimental/testing/browser'

it('classifies actual WebKit Promises without authored getters or proxy effects', async () => {
  const output = await mkdtemp(join(tmpdir(), 'next-webkit-engine-brand-'))
  try {
    const project = join(__dirname, '../../..')
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'webkit-engine-brand.cjs'), project, project, output],
      { timeout: 60000 }
    )
    expect(JSON.parse(stdout)).toMatchObject({
      nativeContext: true,
      sameNativeFrame: true,
      allOwnersClosed: true,
      result: { tagReads: 0, proxyTraps: 0, thenReads: 0 },
    })
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 90000)

it('joins a throwing WebKit failure observer without an unhandled pause promise', async () => {
  const { EventEmitter } = await import('node:events')
  const { createWebKitEngineBrand } = await import(
    'next/dist/experimental/testing/browser/webkit-engine-brand'
  )
  const original = new Error('actual paused owner failed')
  const observer = new Error('failure observer failed')
  let failOwner = false
  const session = Object.assign(new EventEmitter(), {
    send: jest.fn(async () => ({})),
    isDisposed: () => false,
  })
  const onFailure = jest.fn(() => {
    throw observer
  })
  const brand = createWebKitEngineBrand({
    owner: {
      session,
      pageGuid: 'owned-page',
      contextGuid: 'owned-context',
      assertCurrent() {
        if (failOwner) throw original
      },
      mainFrameId: () => 'owned-frame',
      bootstrapSource: () => '/* retained SDK initializer */',
    },
    signal: new AbortController().signal,
    onFailure,
    initializer: {
      source: '/* owned classifier */',
      url: 'next-test-engine-brand://observer-control',
      registrationLine: 0,
      classificationLine: 1,
    },
  })
  await brand.start()
  failOwner = true
  session.emit('Debugger.paused', { callFrames: [] })
  await expect(brand.afterOwnersClosed()).rejects.toMatchObject({
    errors: [observer],
  })
  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith(original)
  expect(session.send).toHaveBeenCalledWith('Debugger.resume')
  expect(session.send).toHaveBeenCalledWith('Debugger.disable', undefined)
  expect(() => brand.fact()).toThrow(original)
})

// Resource tests use a trivial HTTP document; the separate e2e suite is the
// oracle for actual Next compilation, streaming, and instant shell behavior.
describe('Next-managed browser resources', () => {
  let server: Server
  let host: BrowserHost
  let browser: Browser
  let baseURL: string
  let outputDir: string
  let attempts: BrowserAttempt[]

  beforeAll(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'next-browser-resources-'))
    server = createServer((_req, res) => {
      res.setHeader('content-type', 'text/html')
      res.end('<h1>Browser fixture</h1>')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No HTTP port')
    baseURL = `http://127.0.0.1:${address.port}`
    host = await createBrowserHost({
      projectDir: join(__dirname, '../../..'),
      signal: new AbortController().signal,
    })
    browser = await connectBrowserHost({
      projectDir: join(__dirname, '../../..'),
      wsEndpoint: host.wsEndpoint,
    })
  })

  beforeEach(() => {
    attempts = []
  })

  afterEach(async () => {
    // Preserve already asserted disposal failures while closing every other
    // lease if a body assertion failed before its normal cleanup.
    await Promise.all(attempts.map((attempt) => attempt.dispose()))
  })

  afterAll(async () => {
    try {
      await browser?.close()
    } finally {
      try {
        await host?.dispose()
      } finally {
        if (server) {
          await new Promise<void>((resolve) => server.close(() => resolve()))
        }
      }
    }
  })

  async function acquire(options: { signal?: AbortSignal } = {}) {
    const attempt = await createBrowserAttempt({
      browser,
      baseURL,
      outputDir,
      signal: options.signal ?? new AbortController().signal,
    })
    attempts.push(attempt)
    await attempt.page.goto('/')
    return attempt
  }

  it('isolates application cookies and storage across attempts', async () => {
    const first = await acquire()
    await first.context.addCookies([
      { name: 'application', value: 'first', url: baseURL },
    ])
    await first.page.evaluate(() => localStorage.setItem('attempt', 'first'))
    const second = await acquire()
    expect(await second.context.cookies()).toEqual([])
    expect(
      await second.page.evaluate(() => localStorage.getItem('attempt'))
    ).toBeNull()
    await Promise.all([
      instant(first.page, async () => {}),
      instant(second.page, async () => {}),
    ])
  })

  it('uses the actual instant helper and preserves app cookies on callback failure', async () => {
    const attempt = await acquire()
    await attempt.context.addCookies([
      { name: 'application', value: 'first', url: baseURL },
    ])
    await expect(
      instant(attempt.page, async () => {
        throw new Error('callback failed')
      })
    ).rejects.toThrow('callback failed')
    expect(
      (await attempt.context.cookies()).map((cookie) => cookie.name)
    ).toEqual(['application'])
  })

  it('captures unique artifacts and closes the context after abort', async () => {
    const controller = new AbortController()
    const attempt = await acquire({ signal: controller.signal })
    controller.abort()
    const disposal = attempt.dispose()
    expect(attempt.dispose()).toBe(disposal)
    const attachments = await disposal
    expect(attachments.map((attachment) => attachment.kind)).toEqual([
      'screenshot',
      'trace',
    ])
    for (const attachment of attachments) {
      expect((await stat(attachment.path)).size).toBeGreaterThan(0)
    }
    expect(browser.contexts()).toHaveLength(0)
  })

  it('reports artifact failures and still closes the context', async () => {
    const attempt = await createBrowserAttempt({
      browser,
      baseURL,
      outputDir,
      signal: new AbortController().signal,
      onAttachment() {
        throw new Error('reporter failed')
      },
    })
    // This disposal is explicitly asserted, rather than repeated in afterEach.
    await expect(attempt.dispose()).rejects.toBeInstanceOf(BrowserFixtureError)
    expect(browser.contexts()).toHaveLength(0)
  })

  it('lets the parent host close an orphan connection', async () => {
    const controller = new AbortController()
    const orphanHost = await createBrowserHost({
      projectDir: join(__dirname, '../../..'),
      signal: controller.signal,
    })
    try {
      const orphan = await connectBrowserHost({
        projectDir: join(__dirname, '../../..'),
        wsEndpoint: orphanHost.wsEndpoint,
      })
      await orphan.newContext()
      controller.abort()
      // Run cancellation must not race the driver's own context teardown.
      // The coordinator disposes this host only after the driver has closed.
      expect(orphan.isConnected()).toBe(true)
      await orphan.newContext()
      await orphanHost.dispose()
      expect(orphan.isConnected()).toBe(false)
    } finally {
      await orphanHost.dispose()
    }
  })

  it('registers fixture teardown and delegates instant to the installed helper', async () => {
    const cleanups: Array<() => Promise<void>> = []
    const attachments: string[] = []
    const fixture = await createBrowserFixture({
      projectDir: join(__dirname, '../../..'),
      wsEndpoint: host.wsEndpoint,
      baseURL,
      outputDir,
      attempt: {
        signal: new AbortController().signal,
        onCleanup(cleanup) {
          cleanups.push(cleanup)
        },
      },
      onAttachment(attachment) {
        attachments.push(attachment.kind)
      },
    })
    try {
      await fixture.instant(async () => {
        await fixture.page.goto('/')
        expect(
          (await fixture.context.cookies()).some(
            (cookie) => cookie.name === 'next-instant-navigation-testing'
          )
        ).toBe(true)
      })
      expect(await fixture.context.cookies()).toEqual([])
    } finally {
      for (const cleanup of cleanups.reverse()) await cleanup()
    }
    expect(fixture.page.isClosed()).toBe(true)
    expect(attachments).toEqual(['screenshot', 'trace'])
  })

  it('retains resource and connection cleanup failures in order', async () => {
    const cleanups: Array<() => Promise<void>> = []
    const resourceError = new Error('attachment sink failed')
    const connectionError = new Error('connection cleanup failed')
    const fixture = await createBrowserFixture({
      projectDir: join(__dirname, '../../..'),
      wsEndpoint: host.wsEndpoint,
      baseURL,
      outputDir,
      attempt: {
        signal: new AbortController().signal,
        onCleanup(cleanup) {
          cleanups.push(cleanup)
        },
      },
      onAttachment() {
        throw resourceError
      },
    })
    const connection = fixture.context.browser()!
    const close = connection.close.bind(connection)
    // Close the real connection before injecting the failure so the test
    // cannot strand a browser when an assertion fails.
    const closeSpy = jest
      .spyOn(connection, 'close')
      .mockImplementation(async () => {
        await close()
        throw connectionError
      })
    try {
      const disposal = cleanups[0]()
      expect(cleanups[0]()).toBe(disposal)
      await expect(disposal).rejects.toMatchObject({
        name: 'BrowserFixtureError',
        errors: [
          expect.objectContaining({ errors: [resourceError, resourceError] }),
          connectionError,
        ],
      })
      expect(closeSpy).toHaveBeenCalledTimes(1)
      expect(fixture.page.isClosed()).toBe(true)
      expect(connection.isConnected()).toBe(false)
    } finally {
      closeSpy.mockRestore()
      await close()
    }
  }, 10_000)

  it('rejects a cancelled attempt before connecting to a browser', async () => {
    const controller = new AbortController()
    controller.abort(new Error('attempt cancelled'))
    await expect(
      createBrowserFixture({
        projectDir: join(__dirname, '../../..'),
        wsEndpoint: 'ws://127.0.0.1:1',
        baseURL,
        outputDir,
        attempt: {
          signal: controller.signal,
          onCleanup() {
            throw new Error('must not register')
          },
        },
        onAttachment() {},
      })
    ).rejects.toThrow('attempt cancelled')
  })

  it('binds the emitted facade to one real fixture per supplied attempt', async () => {
    const cleanups: Array<() => Promise<void>> = []
    let attemptIndex = 0
    const makeAttempt = () => ({
      id: `attempt-${attemptIndex++}`,
      fileId: 'browser-resources',
      testId: 'facade',
      retry: 0,
      repeat: 0 as const,
      signal: new AbortController().signal,
      onCleanup(cleanup: () => Promise<void>) {
        cleanups.push(cleanup)
      },
    })
    let active: ReturnType<typeof makeAttempt> | undefined
    const createFixture = jest.fn((attempt: ReturnType<typeof makeAttempt>) =>
      createBrowserFixture({
        projectDir: join(__dirname, '../../..'),
        wsEndpoint: host.wsEndpoint,
        baseURL,
        outputDir,
        attempt,
        onAttachment() {},
      })
    )
    const binding = initializeBrowserTesting({
      getActiveAttempt: () => active,
      createFixture,
    })
    try {
      expect(() => getBrowserFixture()).toThrow('active Next test attempt')
      expect(() =>
        initializeBrowserTesting({
          getActiveAttempt: () => active,
          createFixture,
        })
      ).toThrow('already initialized')
      active = makeAttempt()
      const first = getBrowserFixture()
      expect(getBrowserFixture()).toBe(first)
      await (await first).page.goto('/')
      active = makeAttempt()
      const second = getBrowserFixture()
      expect(second).not.toBe(first)
      expect((await second).context).not.toBe((await first).context)
      expect(createFixture).toHaveBeenCalledTimes(2)
    } finally {
      binding.dispose()
      for (const cleanup of cleanups.reverse()) await cleanup()
    }
    expect(() => getBrowserFixture()).toThrow(
      'initialized Next browser test environment'
    )
  })

  it('rejects proxy props before serialization or browser navigation', async () => {
    const attempt = await createBrowserAttempt({
      browser,
      baseURL,
      outputDir,
      signal: new AbortController().signal,
    })
    attempts.push(attempt)
    const navigate = jest.spyOn(attempt.page, 'goto')
    const toJSON = jest.fn(() => ({ injected: true }))
    const get = jest.fn((_target, key) =>
      key === 'toJSON' ? toJSON : undefined
    )
    const props = { nested: new Proxy({}, { get }) }
    const component = createComponentMount({
      page: attempt.page,
      baseURL,
      host: { routePrefix: '/private-fixtures', fixtureIds: ['fixture'] },
      signal: new AbortController().signal,
      assertActiveAttempt() {},
    })
    try {
      await expect(component.mount('fixture', props)).rejects.toThrow(/prox/i)
      expect(get).not.toHaveBeenCalled()
      expect(toJSON).not.toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
    } finally {
      navigate.mockRestore()
      component.dispose()
    }
  })

  it('retains component errors through awaited artifact and context teardown', async () => {
    let captured: () => void
    let release: () => void
    const screenshotCaptured = new Promise<void>((resolve) => {
      captured = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cleanups: Array<() => Promise<void>> = []
    const resource = await createBrowserFixture({
      projectDir: join(__dirname, '../../..'),
      wsEndpoint: host.wsEndpoint,
      baseURL,
      outputDir,
      componentHost: {
        routePrefix: '/private-fixtures',
        fixtureIds: ['fixture'],
      },
      attempt: {
        signal: new AbortController().signal,
        onCleanup: (fn) => cleanups.push(fn),
      },
      async onAttachment(attachment) {
        if (attachment.kind === 'screenshot') {
          captured()
          await gate
        }
      },
    })
    // A transport stub isolates listener lifetime; real hydration has its e2e gate.
    await resource.page.route('**/private-fixtures/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<div data-next-test-root data-next-test-hydrated="true">fixture</div>',
      })
    )
    expect(resource.component.mount).toBe(resource.mount)
    await resource.component.mount('fixture')
    const disposal = cleanups[0]()
    const result = disposal.then(
      () => undefined,
      (error: unknown) => error
    )
    try {
      await screenshotCaptured
      expect(resource.page.isClosed()).toBe(false)
      const observed = resource.page.waitForEvent('pageerror')
      await resource.page.evaluate(() =>
        queueMicrotask(() => {
          throw new Error('H3_ERROR_DURING_TEARDOWN')
        })
      )
      await observed
    } finally {
      release!()
    }
    expect(await result).toMatchObject({
      message: expect.stringContaining('H3_ERROR_DURING_TEARDOWN'),
    })
    expect(resource.page.isClosed()).toBe(true)
    expect(resource.context.pages()).toHaveLength(0)
  })
})

it('prepares the same actual project binding before connection and retains a healthy following connection', async () => {
  const projectDir = join(__dirname, '../../..')
  const { createRequire } = require('node:module')
  const actual = createRequire(join(projectDir, 'package.json'))('playwright')
  const controller = new AbortController()
  const acquired = await createBrowserHost({
    projectDir,
    signal: controller.signal,
  })
  let connected: Browser | undefined
  try {
    const failure = new Error('actual preconnection callback rejected')
    await expect(
      connectBrowserHost({
        projectDir,
        wsEndpoint: acquired.wsEndpoint,
        beforeConnect: async (playwright) => {
          expect(playwright).toBe(actual)
          throw failure
        },
      })
    ).rejects.toBe(failure)
    connected = await connectBrowserHost({
      projectDir,
      wsEndpoint: acquired.wsEndpoint,
    })
    expect(connected.isConnected()).toBe(true)
    expect(connected.contexts()).toHaveLength(0)
  } finally {
    await connected?.close()
    await acquired.dispose()
  }
})

it('joins an acquired host cancelled while its actual preconnection callback is pending', async () => {
  const projectDir = join(__dirname, '../../..')
  const controller = new AbortController()
  const acquired = await createBrowserHost({
    projectDir,
    signal: controller.signal,
  })
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const prepared = new Promise<void>((resolve) => {
    entered = resolve
  })
  const connecting = connectBrowserHost({
    projectDir,
    wsEndpoint: acquired.wsEndpoint,
    timeout: 1000,
    beforeConnect: async () => {
      entered()
      await gate
    },
  }).then(
    (browser) => ({ browser }),
    (error) => ({ error })
  )
  try {
    await prepared
    controller.abort(new Error('actual acquisition owner cancelled'))
    await acquired.dispose()
    release()
    const outcome = await connecting
    if ('browser' in outcome) {
      await outcome.browser.close()
      throw new Error('Cancelled acquired host accepted a connection')
    }
    expect(outcome.error).toBeDefined()
    expect(outcome.error.message).toBeTruthy()
  } finally {
    release()
    await connecting
    await acquired.dispose()
  }
})

describe('owned WebKit browser binding', () => {
  const { createWebKitBrowserHost } =
    require('next/dist/experimental/testing/browser/webkit-host') as typeof import('next/dist/experimental/testing/browser/webkit-host')

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((accept) => {
      resolve = accept
    })
    return { promise, resolve }
  }

  function binding() {
    const session = {
      send: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      isDisposed: jest.fn(() => false),
    }
    const nativeContext = { guid: 'actual-context', pages: jest.fn() }
    const nativePage = {
      guid: 'actual-page',
      browserContext: nativeContext,
      mainFrame: () => ({ _id: 'actual-frame' }),
      delegate: {
        _session: session,
        _calculateBootstrapScript: () => 'actual sdk bootstrap bytes',
      },
    }
    nativeContext.pages.mockReturnValue([nativePage])
    const native = {
      contexts: jest.fn(() => [nativeContext]),
      isConnected: jest.fn(() => true),
    }
    const browser = {
      bind: jest.fn(async () => ({ endpoint: 'ws://127.0.0.1/owned' })),
      unbind: jest.fn(async () => {}),
      close: jest.fn(async () => {}),
      _connection: { toImpl: jest.fn(() => native) },
    }
    const playwright = {
      webkit: { launch: jest.fn(async () => browser) },
    }
    const context = { _guid: nativeContext.guid }
    const page = {
      _guid: nativePage.guid,
      context: jest.fn(() => context),
      isClosed: jest.fn(() => false),
    }
    async function acquire(signal = new AbortController().signal) {
      return createWebKitBrowserHost(
        { signal },
        playwright as unknown as typeof import('playwright')
      )
    }
    function pageOwner(host: BrowserHost) {
      return host.webKitPageOwner!(
        context as unknown as import('playwright').BrowserContext,
        page as unknown as import('playwright').Page
      )
    }
    return {
      session,
      nativeContext,
      nativePage,
      native,
      browser,
      playwright,
      context,
      page,
      acquire,
      pageOwner,
    }
  }

  it('never launches an already cancelled host', async () => {
    const fixture = binding()
    const controller = new AbortController()
    const reason = new Error('cancelled before launch')
    controller.abort(reason)
    await expect(fixture.acquire(controller.signal)).rejects.toBe(reason)
    expect(fixture.playwright.webkit.launch).not.toHaveBeenCalled()
  })

  it('joins a late acquired browser before reporting launch cancellation', async () => {
    const fixture = binding()
    const launch = deferred<typeof fixture.browser>()
    fixture.playwright.webkit.launch.mockReturnValueOnce(launch.promise)
    const controller = new AbortController()
    const reason = new Error('cancelled during launch')
    const result = fixture.acquire(controller.signal).catch((error) => error)
    controller.abort(reason)
    expect(fixture.browser.close).not.toHaveBeenCalled()
    launch.resolve(fixture.browser)
    expect(await result).toBe(reason)
    expect(fixture.browser.bind).not.toHaveBeenCalled()
    expect(fixture.browser.unbind).not.toHaveBeenCalled()
    expect(fixture.browser.close).toHaveBeenCalledTimes(1)
  })

  it('joins a late binding and closes only its acquired browser on cancellation', async () => {
    const fixture = binding()
    const bound = deferred<{ endpoint: string }>()
    fixture.browser.bind.mockReturnValueOnce(bound.promise)
    const controller = new AbortController()
    const reason = new Error('cancelled during bind')
    const result = fixture.acquire(controller.signal).catch((error) => error)
    await Promise.resolve()
    expect(fixture.browser.bind).toHaveBeenCalledTimes(1)
    controller.abort(reason)
    expect(fixture.browser.close).not.toHaveBeenCalled()
    bound.resolve({ endpoint: 'ws://127.0.0.1/late' })
    expect(await result).toBe(reason)
    expect(fixture.browser.unbind).toHaveBeenCalledTimes(1)
    expect(fixture.browser.close).toHaveBeenCalledTimes(1)
  })

  it('retains the actual binding error while joining partial acquisition', async () => {
    const fixture = binding()
    const failure = new Error('actual bind rejected')
    fixture.browser.bind.mockRejectedValueOnce(failure)
    await expect(fixture.acquire()).rejects.toBe(failure)
    expect(fixture.browser.unbind).toHaveBeenCalledTimes(1)
    expect(fixture.browser.close).toHaveBeenCalledTimes(1)
  })

  it('retains acquisition and both distinct cleanup errors in their actual order', async () => {
    const fixture = binding()
    const failure = new Error('binding failed')
    const unbind = new Error('unbind failed')
    const close = new Error('close failed')
    fixture.browser.bind.mockRejectedValueOnce(failure)
    fixture.browser.unbind.mockRejectedValueOnce(unbind)
    fixture.browser.close.mockRejectedValueOnce(close)
    const error = await fixture.acquire().catch((error) => error)
    expect(error).toBeInstanceOf(BrowserFixtureError)
    expect(error.errors[0]).toBe(failure)
    expect(error.errors[1].errors).toEqual([unbind, close])
    expect(fixture.browser.close).toHaveBeenCalledTimes(1)
  })

  it('closes an acquired SDK without a local native binding', async () => {
    const fixture = binding()
    fixture.browser._connection.toImpl = undefined as any
    await expect(fixture.acquire()).rejects.toThrow('local browser binding')
    expect(fixture.browser.bind).not.toHaveBeenCalled()
    expect(fixture.browser.close).toHaveBeenCalledTimes(1)
  })

  it('owns one joined disposal and invalidates capabilities before cleanup awaits', async () => {
    const fixture = binding()
    const host = await fixture.acquire()
    const owner = fixture.pageOwner(host)
    const unbinding = deferred<void>()
    fixture.browser.unbind.mockReturnValueOnce(unbinding.promise)
    const disposing = host.dispose()
    expect(host.dispose()).toBe(disposing)
    expect(() => owner.assertCurrent()).toThrow('closed or changed')
    expect(fixture.browser.close).not.toHaveBeenCalled()
    unbinding.resolve()
    await disposing
    expect(fixture.browser.unbind).toHaveBeenCalledTimes(1)
    expect(fixture.browser.close).toHaveBeenCalledTimes(1)
  })

  it('reads only the exact live native page frame and SDK bootstrap bytes', async () => {
    const fixture = binding()
    const host = await fixture.acquire()
    try {
      const owner = fixture.pageOwner(host)
      expect(owner.session).toBe(fixture.session)
      expect(owner.contextGuid).toBe('actual-context')
      expect(owner.pageGuid).toBe('actual-page')
      expect(owner.mainFrameId()).toBe('actual-frame')
      expect(owner.bootstrapSource()).toBe('actual sdk bootstrap bytes')
      expect(fixture.session.send).not.toHaveBeenCalled()
      expect(fixture.session.on).not.toHaveBeenCalled()
      expect(fixture.session.off).not.toHaveBeenCalled()
    } finally {
      await host.dispose()
    }
  })

  it('refuses foreign, duplicated and disconnected native page ownership', async () => {
    const fixture = binding()
    const host = await fixture.acquire()
    try {
      fixture.page.context.mockReturnValueOnce({ _guid: 'foreign' })
      expect(() => fixture.pageOwner(host)).toThrow('outside its live')
      fixture.native.contexts.mockReturnValueOnce([
        fixture.nativeContext,
        fixture.nativeContext,
      ])
      expect(() => fixture.pageOwner(host)).toThrow('actual native owner')
      fixture.nativeContext.pages.mockReturnValueOnce([
        fixture.nativePage,
        fixture.nativePage,
      ])
      expect(() => fixture.pageOwner(host)).toThrow('actual native owner')
      fixture.page.isClosed.mockReturnValueOnce(true)
      expect(() => fixture.pageOwner(host)).toThrow('outside its live')
      fixture.native.isConnected.mockReturnValueOnce(false)
      expect(() => fixture.pageOwner(host)).toThrow('outside its live')
    } finally {
      await host.dispose()
    }
  })

  it('refuses a removed native page and a replaced or disposed shared session', async () => {
    const fixture = binding()
    const host = await fixture.acquire()
    try {
      const owner = fixture.pageOwner(host)
      fixture.nativeContext.pages.mockReturnValueOnce([])
      expect(() => owner.mainFrameId()).toThrow('closed or changed')
      fixture.native.contexts.mockReturnValueOnce([])
      expect(() => owner.bootstrapSource()).toThrow('closed or changed')
      fixture.session.isDisposed.mockReturnValueOnce(true)
      expect(() => owner.assertCurrent()).toThrow('closed or changed')
      fixture.nativePage.delegate._session = { ...fixture.session }
      expect(() => owner.assertCurrent()).toThrow('closed or changed')
    } finally {
      await host.dispose()
    }
    // This is a shared SDK session: the host never sends detach/disable calls.
    expect(fixture.session.send).not.toHaveBeenCalled()
  })
})

describe('Gecko debugger transport ownership', () => {
  const { connectFirefoxRdp } =
    require('next/dist/experimental/testing/browser/firefox-host') as typeof import('next/dist/experimental/testing/browser/firefox-host')

  function frame(packet: object) {
    const bytes = Buffer.from(JSON.stringify(packet))
    return Buffer.concat([Buffer.from(bytes.length + ':'), bytes])
  }

  async function connection(greeting = true) {
    const directory = await mkdtemp(join(tmpdir(), 'ntr-'))
    const socketPath = join(directory, 'rdp')
    let socket!: import('node:net').Socket
    let accepted!: () => void
    const ready = new Promise<void>((resolve) => {
      accepted = resolve
    })
    const server = createNetServer((client) => {
      socket = client
      if (greeting)
        socket.write(frame({ from: 'root', applicationType: 'browser' }))
      accepted()
    })
    await new Promise<void>((resolve) => server.listen(socketPath, resolve))
    let rdp: Awaited<ReturnType<typeof connectFirefoxRdp>> | undefined
    const controller = new AbortController()
    const acquiring = connectFirefoxRdp(socketPath, controller.signal).then(
      (value) => {
        rdp = value
        return value
      }
    )
    await ready
    return {
      socket,
      controller,
      acquiring,
      async dispose() {
        await rdp?.dispose()
        socket.destroy()
        await new Promise<void>((resolve) => server.close(() => resolve()))
        await rm(directory, { recursive: true, force: true })
      },
    }
  }

  it('separates byte-framed FIFO responses from unsolicited events and actor queues', async () => {
    const fixture = await connection()
    try {
      const rdp = await fixture.acquiring
      const events: string[] = []
      rdp.onPacket((packet) => {
        events.push(packet.type!)
        return false
      })
      const first = rdp.request('console', 'evaluateJSAsync')
      const second = rdp.request('console', 'evaluateJSAsync')
      const other = rdp.request('other', 'source')
      // A multibyte string split in the middle of its UTF-8 sequence exercises
      // actual byte length rather than JavaScript string length.
      const bytes = Buffer.concat([
        frame({
          from: 'console',
          type: 'evaluationResult',
          resultID: 'early',
          result: 'λ😀',
        }),
        frame({ from: 'other', source: 'actual other source' }),
        frame({ from: 'console', resultID: 'one' }),
        frame({ from: 'console', resultID: 'two' }),
      ])
      const split = bytes.indexOf(Buffer.from('😀')) + 1
      fixture.socket.write(bytes.subarray(0, split))
      fixture.socket.write(bytes.subarray(split))
      await expect(first).resolves.toMatchObject({ resultID: 'one' })
      await expect(second).resolves.toMatchObject({ resultID: 'two' })
      await expect(other).resolves.toMatchObject({
        source: 'actual other source',
      })
      expect(events).toEqual(['evaluationResult'])
    } finally {
      await fixture.dispose()
    }
  })

  it('receives a typed lexical environment form as its frame request reply', async () => {
    const fixture = await connection()
    try {
      const rdp = await fixture.acquiring
      const events: string[] = []
      rdp.onPacket((packet) => {
        events.push(packet.type!)
        return false
      })
      const environment = rdp.request('frame', 'getEnvironment')
      fixture.socket.write(
        Buffer.concat([
          frame({
            from: 'thread',
            type: 'newSource',
            source: { actor: 'source' },
          }),
          frame({
            from: 'frame',
            actor: 'environment',
            type: 'block',
            scopeKind: 'function lexical',
            bindings: {
              arguments: [],
              variables: {
                publishDecision: {
                  value: { type: 'object', class: 'Function', actor: 'setter' },
                },
              },
            },
          }),
        ])
      )
      await expect(environment).resolves.toMatchObject({
        actor: 'environment',
        type: 'block',
        bindings: {
          variables: { publishDecision: { value: { actor: 'setter' } } },
        },
      })
      expect(events).toEqual(['newSource'])
    } finally {
      await fixture.dispose()
    }
  })

  it('keeps thread events separate from a resume reply and the next queued request', async () => {
    const fixture = await connection()
    try {
      const rdp = await fixture.acquiring
      const events: string[] = []
      rdp.onPacket((packet) => {
        events.push(packet.type!)
        return packet.type === 'paused'
      })
      const settled = jest.fn()
      const resumed = rdp.request('thread', 'resume').then((packet) => {
        settled()
        return packet
      })
      const frames = rdp.request('thread', 'frames')
      const checkpoint = rdp.request('root', 'listTabs')
      fixture.socket.write(
        Buffer.concat([
          frame({ from: 'thread', type: 'resumed' }),
          frame({ from: 'root', tabs: [] }),
        ])
      )
      await checkpoint
      expect(settled).not.toHaveBeenCalled()
      expect(events).toEqual(['resumed'])
      fixture.socket.write(
        Buffer.concat([
          frame({ from: 'thread' }),
          frame({
            from: 'thread',
            type: 'paused',
            why: { type: 'debuggerStatement' },
          }),
          frame({ from: 'thread', frames: [{ actor: 'actual-frame' }] }),
        ])
      )
      await expect(resumed).resolves.toEqual({ from: 'thread' })
      await expect(frames).resolves.toMatchObject({
        frames: [{ actor: 'actual-frame' }],
      })
      expect(events).toEqual(['resumed', 'paused'])
    } finally {
      await fixture.dispose()
    }
  })

  it('keeps an unclaimed pause resumable and duplicate resume errors actor-local', async () => {
    const fixture = await connection()
    try {
      const rdp = await fixture.acquiring
      const resumed = new Promise<void>((resolve) => {
        fixture.socket.once('data', (bytes) => {
          expect(bytes.toString()).toContain('"type":"resume"')
          fixture.socket.write(
            Buffer.concat([
              frame({ from: 'thread', type: 'resumed' }),
              frame({ from: 'thread' }),
            ])
          )
          resolve()
        })
      })
      fixture.socket.write(
        frame({
          from: 'thread',
          type: 'paused',
          why: { type: 'debuggerStatement' },
        })
      )
      await resumed
      const duplicate = rdp.request('thread', 'resume')
      fixture.socket.write(
        frame({
          from: 'thread',
          error: 'wrongState',
          message: 'already running',
        })
      )
      await expect(duplicate).rejects.toThrow('already running')
      const next = rdp.request('root', 'listTabs')
      fixture.socket.write(frame({ from: 'root', tabs: [] }))
      await expect(next).resolves.toMatchObject({ tabs: [] })
    } finally {
      await fixture.dispose()
    }
  })

  it('rejects pending requests and notifies loss once after unexpected transport exit', async () => {
    const fixture = await connection()
    try {
      const rdp = await fixture.acquiring
      const closed = jest.fn()
      rdp.onClosed(closed)
      const first = rdp.request('one', 'source').catch((error) => error)
      const second = rdp.request('two', 'source').catch((error) => error)
      fixture.socket.end()
      expect(await first).toBeInstanceOf(Error)
      expect(await second).toBeInstanceOf(Error)
      expect(closed).toHaveBeenCalledTimes(1)
      await rdp.dispose()
      await rdp.dispose()
      expect(closed).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.dispose()
    }
  })

  it('joins an acquisition cancelled before its greeting', async () => {
    const fixture = await connection(false)
    try {
      const result = fixture.acquiring.catch((error) => error)
      fixture.controller.abort()
      expect(await result).toEqual(
        expect.objectContaining({
          message: 'Firefox debugger acquisition cancelled.',
        })
      )
    } finally {
      await fixture.dispose()
    }
  })

  it('releases evaluation-event observers when its owner closes after a result ID', async () => {
    const fixture = await connection()
    try {
      const rdp = await fixture.acquiring
      const evaluation = rdp.request('console', 'evaluateJSAsync')
      fixture.socket.write(frame({ from: 'console', resultID: 'owned-result' }))
      await expect(evaluation).resolves.toMatchObject({
        resultID: 'owned-result',
      })
      const closed = jest.fn()
      const unavailable = new Promise<Error>((resolve) => {
        rdp.onClosed((error) => {
          closed(error)
          resolve(error)
        })
      })
      const disposal = rdp.dispose()
      expect(rdp.dispose()).toBe(disposal)
      await expect(unavailable).resolves.toEqual(
        expect.objectContaining({
          message: 'Firefox debugger closed by its owner.',
        })
      )
      await disposal
      expect(closed).toHaveBeenCalledTimes(1)
      await expect(rdp.request('console', 'evaluateJSAsync')).rejects.toThrow(
        'closed by its owner'
      )
    } finally {
      await fixture.dispose()
    }
  })
})

describe('selected native test Frame ownership', () => {
  const {
    createBrowserFrameOwner,
  } = require('next/dist/experimental/testing/browser/frame-owner')
  function harness() {
    const state = {
      connected: true,
      closed: false,
      detached: false,
      hostClosed: false,
    }
    const context: any = { _guid: 'context' }
    const page: any = {
      _guid: 'page',
      context: () => context,
      isClosed: () => state.closed,
      mainFrame: () => main,
    }
    const main: any = { _guid: 'main', page: () => page }
    const frame: any = {
      _guid: 'selected',
      page: () => page,
      parentFrame: () => main,
      isDetached: () => state.detached,
    }
    const nativeContext: any = { guid: 'context', pages: () => nativePages }
    const nativePage: any = {
      guid: 'page',
      browserContext: nativeContext,
      mainFrame: () => nativeMain,
      frames: () => nativeFrames,
    }
    const nativeMain: any = {
      guid: 'main',
      _id: 'actual-main',
      _page: nativePage,
      parentFrame: () => null,
    }
    const nativeFrame: any = {
      guid: 'selected',
      _id: 'actual-child',
      _page: nativePage,
      parentFrame: () => nativeMain,
    }
    const nativePages = [nativePage],
      nativeFrames = [nativeMain, nativeFrame]
    const native = {
      isConnected: () => state.connected,
      contexts: () => [nativeContext],
    }
    const options = {
      engine: 'chromium',
      native,
      context,
      page,
      frame,
      selected: new WeakMap(),
      assertHost() {
        if (state.hostClosed) throw new Error('host closed')
      },
    }
    return {
      state,
      options,
      nativePage,
      nativeFrame,
      nativePages,
      nativeFrames,
      acquire: (overrides = {}) =>
        createBrowserFrameOwner({ ...options, ...overrides }),
    }
  }
  it('retains one actual native child independently of its current document', () => {
    const h = harness(),
      owner = h.acquire()
    expect(owner.nativeFrameId()).toBe('actual-child')
    expect(h.acquire().nativeFrameId()).toBe('actual-child')
    expect(owner.frameGuid).toBe('selected')
    expect(owner.contextGuid).toBe('context')
    expect(owner.pageGuid).toBe('page')
    expect(() => h.acquire({ frame: h.options.page.mainFrame() })).toThrow()
    expect(() => h.acquire({ context: { _guid: 'context' } })).toThrow()
    expect(() => h.acquire({ page: { ...h.options.page } })).toThrow()
    owner.assertCurrent()
  })
  it('refuses replacement native objects even with identical frame identifiers', () => {
    const h = harness(),
      owner = h.acquire()
    h.nativeFrames[1] = { ...h.nativeFrame }
    expect(() => owner.assertCurrent()).toThrow(/ownership/)
    expect(() => h.acquire()).toThrow(/different selected/)
  })
  it.each<[string, (value: ReturnType<typeof harness>) => void]>([
    [
      'browser disconnect',
      (h: any) => {
        h.state.connected = false
      },
    ],
    [
      'host closure',
      (h: any) => {
        h.state.hostClosed = true
      },
    ],
    [
      'Page closure',
      (h: any) => {
        h.state.closed = true
      },
    ],
    [
      'Frame detach',
      (h: any) => {
        h.state.detached = true
      },
    ],
    [
      'native Page removal',
      (h: any) => {
        h.nativePages.splice(0)
      },
    ],
    [
      'native Frame removal',
      (h: any) => {
        h.nativeFrames.splice(1)
      },
    ],
    [
      'native Frame id replacement',
      (h: any) => {
        h.nativeFrame._id = 'another-child'
      },
    ],
    [
      'native Page membership change',
      (h: any) => {
        h.nativeFrame._page = {}
      },
    ],
  ])('revokes held Frame access after %s', (_label, change) => {
    const h = harness(),
      owner = h.acquire()
    change(h)
    expect(() => owner.nativeFrameId()).toThrow()
  })
})

describe('explicit actual Browser host launch mode', () => {
  it.each([undefined, false, true])(
    'forwards Chromium server headless=%s and joins the lease',
    async (headless) => {
      const projectDir = join(__dirname, '../../..')
      const { createRequire } = require('node:module')
      const playwright = createRequire(join(projectDir, 'package.json'))(
        'playwright'
      )
      const close = jest.fn().mockResolvedValue(undefined)
      const launch = jest
        .spyOn(playwright.chromium, 'launchServer')
        .mockResolvedValue({
          wsEndpoint: () => 'ws://owned-headless-unit',
          close,
        } as any)
      try {
        const host = await createBrowserHost({
          projectDir,
          signal: new AbortController().signal,
          ...(headless === undefined ? {} : { headless }),
        })
        expect(launch).toHaveBeenCalledWith(
          expect.objectContaining({
            headless: headless ?? true,
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false,
          })
        )
        await host.dispose()
        await host.dispose()
        expect(close).toHaveBeenCalledTimes(1)
      } finally {
        launch.mockRestore()
      }
    }
  )

  it.each(['chromium', 'firefox', 'webkit'] as const)(
    'forwards explicit modes to the actual private %s launch producer before acquisition errors',
    async (engine) => {
      const { createChromiumFrameHost } = await import(
        'next/dist/experimental/testing/browser/frame-host'
      )
      const { createFirefoxBrowserHost } = await import(
        'next/dist/experimental/testing/browser/firefox-host'
      )
      const { createWebKitBrowserHost } = await import(
        'next/dist/experimental/testing/browser/webkit-host'
      )
      const create =
        engine === 'chromium'
          ? createChromiumFrameHost
          : engine === 'firefox'
            ? createFirefoxBrowserHost
            : createWebKitBrowserHost
      for (const headless of [undefined, false, true]) {
        const error = new Error('owned launch probe failed')
        const launch = jest.fn().mockRejectedValue(error)
        const playwright = { [engine]: { launch } } as any
        await expect(
          create(
            {
              signal: new AbortController().signal,
              ...(headless === undefined ? {} : { headless }),
            },
            playwright
          )
        ).rejects.toBe(error)
        expect(launch).toHaveBeenCalledWith(
          expect.objectContaining({
            headless: headless ?? true,
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false,
          })
        )
      }
    }
  )
})

it('classifies actual WebKit Promises in the owned child frame', async () => {
  const output = await mkdtemp(
    join(tmpdir(), 'next-webkit-frame-engine-brand-')
  )
  try {
    const project = join(__dirname, '../../..')
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'webkit-frame-engine-brand.cjs'),
        project,
        project,
        output,
      ],
      { timeout: 60000 }
    )
    expect(JSON.parse(stdout)).toMatchObject({
      nativeContext: true,
      sameNativeFrame: true,
      allOwnersClosed: true,
      actualOwnedChild: true,
      parentAndSiblingUnchanged: true,
      detachedOwnerRejected: true,
      result: { tagReads: 0, proxyTraps: 0, thenReads: 0 },
    })
  } finally {
    await rm(output, { recursive: true, force: true })
  }
}, 90000)
