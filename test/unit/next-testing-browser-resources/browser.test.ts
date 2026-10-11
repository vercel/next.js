import { createComponentMount } from 'next/dist/experimental/testing/browser/component-host'
import { createServer, type Server } from 'node:http'
import { mkdtemp, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
    await resource.mount('fixture')
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
