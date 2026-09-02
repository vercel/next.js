import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { retry, debugPrint, getFullUrl } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import WebSocket from 'ws'
import { chromium, firefox, webkit } from 'playwright'
import type { Browser, Page } from 'playwright'

describe('mcp-server get_errors tool', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
  })

  interface RuntimeErrorStateMessage {
    type: 'runtime-error-state'
    clientId: string
    pathname: string
    errors: Array<{
      type: string
      errorName: string
      message: string
      fatal: boolean
      stack: Array<{
        file: string
        methodName: string
        line: number | null
        column: number | null
      }>
    }>
  }

  function collectRuntimeErrorStateMessages() {
    const messages: RuntimeErrorStateMessage[] = []
    let reconnect: () => void = () => {
      throw new Error('HMR websocket is not connected')
    }
    let send: (message: string) => void = () => {
      throw new Error('HMR websocket is not connected')
    }

    return {
      messages,
      reconnect() {
        reconnect()
      },
      send(message: string) {
        send(message)
      },
      async beforePageLoad(page: Page) {
        await page.routeWebSocket(/\/_next\/hmr/, (clientSocket) => {
          const serverSocket = clientSocket.connectToServer()

          serverSocket.onMessage((message) => {
            if (typeof message === 'string') {
              try {
                const parsed = JSON.parse(message)
                if (parsed.type === 'runtime-error-state') {
                  messages.push(parsed)
                }
              } catch {
                // Binary and non-JSON HMR frames are unrelated.
              }
            }
            clientSocket.send(message)
          })
          clientSocket.onMessage((message) => serverSocket.send(message))
          reconnect = () => {
            void serverSocket.close()
          }
          send = (message) => serverSocket.send(message)
        })
      },
    }
  }

  async function connectRuntimeErrorStateObserver() {
    const messages: RuntimeErrorStateMessage[] = []
    let resolveInitialSync!: () => void
    const initialSync = new Promise<void>((resolve) => {
      resolveInitialSync = resolve
    })
    const socket = new WebSocket(`${next.url.replace(/^http/, 'ws')}/_next/hmr`)

    socket.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString())
        if (parsed.type === 'runtime-error-state') {
          messages.push(parsed)
        } else if (parsed.type === 'sync') {
          resolveInitialSync()
        }
      } catch {
        // Binary and non-JSON HMR frames are unrelated.
      }
    })

    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve())
      socket.once('error', reject)
    })

    return {
      messages,
      close: () => socket.terminate(),
      initialSync,
    }
  }

  async function waitForPushedRuntimeError(
    messages: RuntimeErrorStateMessage[],
    expected: { pathname: string; message: string; fatal: boolean }
  ) {
    let runtimeError: RuntimeErrorStateMessage['errors'][number] | undefined

    await retry(() => {
      const matchingStates = messages.filter(
        (state) => state.pathname === expected.pathname
      )
      runtimeError = matchingStates
        .flatMap((state) => state.errors)
        .find((error) => error.message === expected.message)
      expect(runtimeError).toMatchObject({
        message: expected.message,
        fatal: expected.fatal,
      })
    }, 10_000)

    return runtimeError!
  }

  async function callGetErrors(id: string) {
    const response = await fetch(`${next.url}/_next/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'get_errors', arguments: {} },
      }),
    })

    const text = await response.text()
    const match = text.match(/data: ({.*})/s)
    const result = JSON.parse(match![1])
    return result.result?.content?.[0]?.text
  }

  async function waitForRuntimeError({
    url,
    message,
    type = 'runtime',
    fatal,
  }: {
    url: string
    message?: string
    type?: 'runtime' | 'recoverable' | 'console'
    fatal: boolean
  }) {
    let runtimeError: any = null

    await retry(async () => {
      const errorsText = await callGetErrors(`test-runtime-${Date.now()}`)
      const errors = JSON.parse(errorsText)
      const session = errors.sessionErrors.find(
        (entry: any) => entry.url === url
      )
      expect(session).toBeDefined()
      runtimeError = session.runtimeErrors.find((error: any) =>
        message ? error.message === message : error.type === type
      )
      expect(runtimeError).toMatchObject({
        type,
        fatal,
        ...(message ? { message } : {}),
      })
    })

    return runtimeError
  }

  it('should handle no browser sessions gracefully', async () => {
    const errorsText = await callGetErrors('test-no-session')
    const errors = JSON.parse(errorsText)
    expect(errors).toMatchInlineSnapshot(`
      {
        "error": "No browser sessions connected. Please open your application in a browser to retrieve error state.",
      }
    `)
  })

  it('should return no errors for clean page', async () => {
    await next.browser('/')
    const errorsText = await callGetErrors('test-1')
    const errors = JSON.parse(errorsText)
    expect(errors).toMatchInlineSnapshot(`
      {
        "configErrors": [],
        "sessionErrors": [],
      }
    `)
  })

  it('should push decoded runtime error state over HMR', async () => {
    const collected = collectRuntimeErrorStateMessages()
    const browser = await next.browser(
      '/client-runtime-error?runtimeSecret=query-secret#fragment-secret',
      {
        beforePageLoad: collected.beforePageLoad,
      }
    )

    const appFatalError = await waitForPushedRuntimeError(collected.messages, {
      pathname: '/client-runtime-error',
      message: 'Test client runtime error',
      fatal: true,
    })
    expect(appFatalError.stack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: expect.stringContaining('app/client-runtime-error/page.tsx'),
        }),
      ])
    )
    expect(JSON.stringify(collected.messages)).not.toContain('query-secret')
    expect(JSON.stringify(collected.messages)).not.toContain('fragment-secret')

    collected.send(
      JSON.stringify({ event: 'runtime-error-state', clientId: 42 })
    )

    await browser.loadPage(`${next.url}/caught-runtime-error`, {
      beforePageLoad: collected.beforePageLoad,
    })
    await waitForPushedRuntimeError(collected.messages, {
      pathname: '/caught-runtime-error',
      message: 'Test caught runtime error',
      fatal: false,
    })

    const messageCountBeforeReconnect = collected.messages.length
    await browser.eval(() => {
      Reflect.set(window, '__runtimeErrorReconnectDocument', true)
    })
    collected.reconnect()
    await retry(() => {
      const replayedState = collected.messages
        .slice(messageCountBeforeReconnect)
        .find(
          (state) =>
            state.pathname === '/caught-runtime-error' &&
            state.errors.some(
              (error) =>
                error.message === 'Test caught runtime error' && !error.fatal
            )
        )
      expect(replayedState).toBeDefined()
    }, 10_000)
    expect(
      await browser.eval(() =>
        Reflect.get(window, '__runtimeErrorReconnectDocument')
      )
    ).toBe(true)

    await browser.loadPage(`${next.url}/event-runtime-error`, {
      beforePageLoad: collected.beforePageLoad,
    })
    await retry(() => {
      expect(
        collected.messages.find(
          (state) =>
            state.pathname === '/event-runtime-error' &&
            state.errors.length === 0
        )
      ).toBeDefined()
    })
    const appCleanNavigationMessageCount = collected.messages.length
    await browser.eval(() => {
      document.getElementById('event-navigation')?.click()
    })
    await retry(() => {
      expect(
        collected.messages
          .slice(appCleanNavigationMessageCount)
          .find((state) => state.pathname === '/')
      ).toBeDefined()
    })

    await browser.loadPage(`${next.url}/event-runtime-error`, {
      beforePageLoad: collected.beforePageLoad,
    })
    await browser.elementByCss('#event-error').click()
    await waitForPushedRuntimeError(collected.messages, {
      pathname: '/event-runtime-error',
      message: 'Test event runtime error',
      fatal: false,
    })
    const appNavigationMessageCount = collected.messages.length
    await browser.eval(() => {
      document.getElementById('event-navigation')?.click()
    })
    await retry(async () => {
      expect(await browser.eval(() => window.location.pathname)).toBe('/')
      expect(
        collected.messages
          .slice(appNavigationMessageCount)
          .find((state) => state.pathname === '/')
      ).toBeDefined()
    })

    await browser.loadPage(`${next.url}/pages-runtime-error`, {
      beforePageLoad: collected.beforePageLoad,
    })
    const pagesFatalError = await waitForPushedRuntimeError(
      collected.messages,
      {
        pathname: '/pages-runtime-error',
        message: 'Test Pages runtime error',
        fatal: true,
      }
    )
    expect(pagesFatalError.stack).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: expect.stringContaining('pages/pages-runtime-error.tsx'),
        }),
      ])
    )

    await browser.loadPage(`${next.url}/pages-non-error-runtime-error`, {
      beforePageLoad: collected.beforePageLoad,
    })
    await waitForPushedRuntimeError(collected.messages, {
      pathname: '/pages-non-error-runtime-error',
      message: 'Test Pages non-Error runtime error',
      fatal: true,
    })

    await browser.loadPage(`${next.url}/pages-event-runtime-error`, {
      beforePageLoad: collected.beforePageLoad,
    })
    await retry(() => {
      expect(
        collected.messages.find(
          (state) =>
            state.pathname === '/pages-event-runtime-error' &&
            state.errors.length === 0
        )
      ).toBeDefined()
    })
    const pagesCleanNavigationMessageCount = collected.messages.length
    await browser.eval(() => {
      document.getElementById('pages-event-navigation')?.click()
    })
    await retry(() => {
      expect(
        collected.messages
          .slice(pagesCleanNavigationMessageCount)
          .find((state) => state.pathname === '/pages-navigation-target')
      ).toBeDefined()
    })

    await browser.loadPage(`${next.url}/pages-event-runtime-error`, {
      beforePageLoad: collected.beforePageLoad,
    })
    await browser.elementByCss('#pages-event-error').click()
    await waitForPushedRuntimeError(collected.messages, {
      pathname: '/pages-event-runtime-error',
      message: 'Test Pages event runtime error',
      fatal: false,
    })
    const pagesNavigationMessageCount = collected.messages.length
    await browser.eval(() => {
      document.getElementById('pages-event-navigation')?.click()
    })
    await retry(async () => {
      expect(await browser.eval(() => window.location.pathname)).toBe(
        '/pages-navigation-target'
      )
      expect(
        collected.messages
          .slice(pagesNavigationMessageCount)
          .find((state) => state.pathname === '/pages-navigation-target')
      ).toBeDefined()
    })

    await browser.loadPage(`${next.url}/pages-caught-runtime-error`, {
      beforePageLoad: collected.beforePageLoad,
    })
    await waitForPushedRuntimeError(collected.messages, {
      pathname: '/pages-caught-runtime-error',
      message: 'Test Pages caught runtime error',
      fatal: false,
    })
    expect(next.cliOutput).not.toContain('unhandledRejection:')
  })

  it('should replay runtime error state to late observers and clear it on disconnect', async () => {
    const first = collectRuntimeErrorStateMessages()
    const firstSession = await launchStandaloneSession(
      next.url,
      '/event-runtime-error',
      first.beforePageLoad
    )
    let observer: Awaited<ReturnType<typeof connectRuntimeErrorStateObserver>>

    let afterDisconnectObserver: Awaited<
      ReturnType<typeof connectRuntimeErrorStateObserver>
    >
    try {
      await firstSession.page.locator('#event-error').click()
      await waitForPushedRuntimeError(first.messages, {
        pathname: '/event-runtime-error',
        message: 'Test event runtime error',
        fatal: false,
      })

      observer = await connectRuntimeErrorStateObserver()

      await waitForPushedRuntimeError(observer.messages, {
        pathname: '/event-runtime-error',
        message: 'Test event runtime error',
        fatal: false,
      })

      const publishedState = observer.messages.find(
        (state) =>
          state.pathname === '/event-runtime-error' &&
          state.errors.some(
            (error) => error.message === 'Test event runtime error'
          )
      )
      expect(publishedState).toBeDefined()
      expect(publishedState!.clientId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
      const messageCountBeforeClose = observer.messages.length

      first.reconnect()
      await retry(() => {
        expect(
          observer.messages
            .slice(messageCountBeforeClose)
            .find(
              (state) =>
                state.clientId === publishedState!.clientId &&
                state.pathname === publishedState!.pathname &&
                state.errors.length === 0
            )
        ).toBeDefined()
      })
      observer.close()
      afterDisconnectObserver = await connectRuntimeErrorStateObserver()
      await afterDisconnectObserver.initialSync
      expect(
        afterDisconnectObserver.messages.some(
          (state) => state.clientId === publishedState!.clientId
        )
      ).toBe(false)
    } finally {
      await firstSession.close()
      observer?.close()
      afterDisconnectObserver?.close()
    }
  })

  it('should push an empty runtime error state after HMR recovery', async () => {
    const pagePath = 'app/hmr-runtime-error/page.tsx'
    const originalPage = await next.readFile(pagePath)
    const collected = collectRuntimeErrorStateMessages()
    const browser = await next.browser('/hmr-runtime-error', {
      beforePageLoad: collected.beforePageLoad,
    })

    try {
      const errorState = await waitForPushedRuntimeError(collected.messages, {
        pathname: '/hmr-runtime-error',
        message: 'Test HMR runtime error',
        fatal: true,
      })
      expect(errorState).toBeDefined()
      const messageCountBeforeRecovery = collected.messages.length

      await next.patchFile(
        pagePath,
        `'use client'\n\nexport default function HmrRuntimeErrorPage() {\n  return <p id="hmr-push-fixed">HMR push fixed</p>\n}\n`
      )

      await retry(async () => {
        expect(
          await browser.eval(
            () => document.querySelector('#hmr-push-fixed')?.textContent
          )
        ).toBe('HMR push fixed')

        const recoveryState = collected.messages
          .slice(messageCountBeforeRecovery)
          .find(
            (state) =>
              state.pathname === '/hmr-runtime-error' &&
              state.errors.length === 0
          )
        expect(recoveryState).toBeDefined()
      })
    } finally {
      await next.patchFile(pagePath, originalPage)
    }
  })

  it('should capture runtime errors with source-mapped stack frames', async () => {
    await next.browser('/runtime-error')

    let errors: any = null
    await retry(async () => {
      const sessionId = 'test-2-' + Date.now()
      const errorsText = await callGetErrors(sessionId)
      errors = JSON.parse(errorsText)
      expect(errors.sessionErrors).toHaveLength(1)
      expect(errors.sessionErrors[0].runtimeErrors).toHaveLength(1)
    })

    expect(errors.sessionErrors[0]).toMatchObject({
      url: '/runtime-error',
      buildError: null,
      runtimeErrors: [
        {
          type: 'runtime',
          errorName: 'Error',
          message: 'Test runtime error',
          fatal: true,
          stack: expect.arrayContaining([
            expect.objectContaining({
              file: expect.stringContaining('app/runtime-error/page.tsx'),
              methodName: 'RuntimeErrorPage',
            }),
          ]),
        },
      ],
    })
  })

  it('should classify App Router runtime errors by whether the app was replaced', async () => {
    const browser = await next.browser('/client-runtime-error')

    await waitForRuntimeError({
      url: '/client-runtime-error',
      message: 'Test client runtime error',
      fatal: true,
    })

    await browser.loadPage(`${next.url}/caught-runtime-error`)
    await waitForRuntimeError({
      url: '/caught-runtime-error',
      message: 'Test caught runtime error',
      fatal: false,
    })
    expect(
      await browser.eval(
        () => document.querySelector('#caught-fallback')?.textContent
      )
    ).toBe('Caught fallback')

    await browser.loadPage(`${next.url}/event-runtime-error`)
    await browser.elementByCss('#event-error').click()
    await waitForRuntimeError({
      url: '/event-runtime-error',
      message: 'Test event runtime error',
      fatal: false,
    })
    expect(
      await browser.eval(
        () => document.querySelector('#event-page-content')?.textContent
      )
    ).toBe('Page remains rendered')

    await browser.loadPage(`${next.url}/rejection-runtime-error`)
    await browser.elementByCss('#rejection-error').click()
    await waitForRuntimeError({
      url: '/rejection-runtime-error',
      message: 'Test unhandled rejection',
      fatal: false,
    })

    await browser.loadPage(`${next.url}/console-runtime-error`)
    await browser.elementByCss('#console-error').click()
    await waitForRuntimeError({
      url: '/console-runtime-error',
      message: 'Test console error',
      type: 'console',
      fatal: false,
    })

    await browser.loadPage(`${next.url}/hydration-runtime-error`)
    await waitForRuntimeError({
      url: '/hydration-runtime-error',
      type: 'recoverable',
      fatal: false,
    })
  })

  it('should treat a route error boundary as non-fatal', async () => {
    const collected = collectRuntimeErrorStateMessages()
    const browser = await next.browser('/route-boundary-error', {
      beforePageLoad: collected.beforePageLoad,
    })

    const pushedError = await waitForPushedRuntimeError(collected.messages, {
      pathname: '/route-boundary-error',
      message: 'Test route boundary error',
      fatal: false,
    })
    expect(pushedError.stack[0]).toEqual(
      expect.objectContaining({
        file: expect.stringContaining('app/route-boundary-error/page.tsx'),
      })
    )
    await waitForRuntimeError({
      url: '/route-boundary-error',
      message: 'Test route boundary error',
      fatal: false,
    })
    expect(
      await browser.eval(
        () => document.querySelector('#route-error-fallback')?.textContent
      )
    ).toBe('Test route boundary error')
  })

  it('should promote a reused error when it later replaces the app', async () => {
    const browser = await next.browser('/shared-runtime-error')
    const getOverlayErrorType = () =>
      browser.eval(() => {
        const portal = Array.from(
          document.querySelectorAll('nextjs-portal')
        ).find((candidate) =>
          candidate.shadowRoot?.querySelector('#nextjs__container_errors_label')
        )
        return (
          portal?.shadowRoot?.querySelector('#nextjs__container_errors_label')
            ?.textContent ?? null
        )
      })

    await browser.elementByCss('#log-shared-error').click()
    await waitForRuntimeError({
      url: '/shared-runtime-error',
      message: 'Test shared runtime error',
      type: 'console',
      fatal: false,
    })
    await retry(async () => {
      expect(await getOverlayErrorType()).toBe('Console Error')
    })
    await browser.eval(() => {
      const portal = Array.from(
        document.querySelectorAll('nextjs-portal')
      ).find((candidate) =>
        candidate.shadowRoot?.querySelector('#nextjs__container_errors_label')
      )
      const label = portal?.shadowRoot?.querySelector(
        '#nextjs__container_errors_label'
      )
      if (!label) throw new Error('Expected the error overlay label')
      Reflect.set(window, '__mcpErrorOverlayLabel', label)
    })

    await browser.elementByCss('#log-background-error').click()
    await waitForRuntimeError({
      url: '/shared-runtime-error',
      message: 'Test background runtime error',
      type: 'console',
      fatal: false,
    })

    expect(
      await browser.eval(
        () => document.querySelector('#shared-page-content')?.textContent
      )
    ).toBe('Page remains rendered')

    await browser.elementByCss('#throw-shared-error').click()
    await waitForRuntimeError({
      url: '/shared-runtime-error',
      message: 'Test shared runtime error',
      fatal: true,
    })
    await waitForRuntimeError({
      url: '/shared-runtime-error',
      message: 'Test background runtime error',
      type: 'console',
      fatal: false,
    })
    await retry(async () => {
      expect(await getOverlayErrorType()).toBe('Runtime Error')
    })
    expect(
      await browser.eval(() => {
        const label = Reflect.get(window, '__mcpErrorOverlayLabel')
        return label instanceof Element && label.isConnected
      })
    ).toBe(true)
    expect(
      await browser.eval(
        () => document.querySelector('#global-error-fallback')?.textContent
      )
    ).toBe('Test shared runtime error')
  })

  it('should classify a non-Error root throw as fatal', async () => {
    const browser = await next.browser('/non-error-runtime-error')

    await waitForRuntimeError({
      url: '/non-error-runtime-error',
      message: 'Test non-Error runtime error',
      fatal: true,
    })
    expect(
      await browser.eval(
        () => document.querySelector('#global-error-fallback')?.textContent
      )
    ).toBe('Test non-Error runtime error')
  })

  it('should classify Pages Router runtime errors by whether the app was replaced', async () => {
    const browser = await next.browser('/pages-runtime-error')

    await waitForRuntimeError({
      url: '/pages-runtime-error',
      message: 'Test Pages runtime error',
      fatal: true,
    })

    await browser.loadPage(`${next.url}/pages-non-error-runtime-error`)
    await waitForRuntimeError({
      url: '/pages-non-error-runtime-error',
      message: 'Test Pages non-Error runtime error',
      fatal: true,
    })
    const nonErrorState = JSON.parse(
      await callGetErrors(`test-pages-non-error-${Date.now()}`)
    )
    const nonErrorSession = nonErrorState.sessionErrors.find(
      (entry: any) => entry.url === '/pages-non-error-runtime-error'
    )
    expect(nonErrorSession.runtimeErrors).toHaveLength(1)

    await browser.loadPage(`${next.url}/pages-caught-runtime-error`)
    await waitForRuntimeError({
      url: '/pages-caught-runtime-error',
      message: 'Test Pages caught runtime error',
      fatal: false,
    })
    expect(
      await browser.eval(
        () => document.querySelector('#pages-caught-fallback')?.textContent
      )
    ).toBe('Caught fallback')

    await browser.loadPage(`${next.url}/pages-event-runtime-error`)
    await browser.elementByCss('#pages-event-error').click()
    await waitForRuntimeError({
      url: '/pages-event-runtime-error',
      message: 'Test Pages event runtime error',
      fatal: false,
    })
    expect(
      await browser.eval(
        () => document.querySelector('#pages-event-page-content')?.textContent
      )
    ).toBe('Page remains rendered')
  })

  it('should treat an unrecoverable Pages Router module error as fatal', async () => {
    const collected = collectRuntimeErrorStateMessages()
    const browser = await next.browser('/pages-module-runtime-error', {
      beforePageLoad: collected.beforePageLoad,
    })

    await waitForPushedRuntimeError(collected.messages, {
      pathname: '/pages-module-runtime-error',
      message: 'Test Pages module runtime error',
      fatal: true,
    })
    await waitForRuntimeError({
      url: '/pages-module-runtime-error',
      message: 'Test Pages module runtime error',
      fatal: true,
    })
    // The stale server HTML remains visible even though hydration cannot complete.
    expect(
      await browser.eval(() => document.querySelector('#__next')?.textContent)
    ).toBe('Server render')
  })

  it('should treat a Pages Router server error as fatal', async () => {
    const collected = collectRuntimeErrorStateMessages()
    await next.browser('/pages-server-runtime-error', {
      beforePageLoad: collected.beforePageLoad,
    })

    await waitForPushedRuntimeError(collected.messages, {
      pathname: '/pages-server-runtime-error',
      message: 'Test Pages server runtime error',
      fatal: true,
    })
    await waitForRuntimeError({
      url: '/pages-server-runtime-error',
      message: 'Test Pages server runtime error',
      fatal: true,
    })
  })

  it('should clear fatality with the runtime error after HMR recovery', async () => {
    const browser = await next.browser('/hmr-runtime-error')

    await waitForRuntimeError({
      url: '/hmr-runtime-error',
      message: 'Test HMR runtime error',
      fatal: true,
    })

    await next.patchFile(
      'app/hmr-runtime-error/page.tsx',
      `'use client'\n\nexport default function HmrRuntimeErrorPage() {\n  return <p id="hmr-fixed">HMR fixed</p>\n}\n`
    )

    await retry(async () => {
      expect(
        await browser.eval(
          () => document.querySelector('#hmr-fixed')?.textContent
        )
      ).toBe('HMR fixed')

      const errorsText = await callGetErrors(`test-hmr-fixed-${Date.now()}`)
      const errors = JSON.parse(errorsText)
      const session = errors.sessionErrors.find(
        (entry: any) => entry.url === '/hmr-runtime-error'
      )
      expect(
        session?.runtimeErrors.find(
          (error: any) => error.message === 'Test HMR runtime error'
        )
      ).toBeUndefined()
    })
  })

  it('should capture build errors when directly visiting error page', async () => {
    await next.browser('/build-error')

    let errors: any = null
    await retry(async () => {
      const sessionId = 'test-4-' + Date.now()
      const errorsText = await callGetErrors(sessionId)
      errors = JSON.parse(errorsText)
      expect(errors.sessionErrors).toHaveLength(1)
      expect(errors.sessionErrors[0].buildError).toBeTruthy()
    })

    expect(errors.sessionErrors[0]).toMatchObject({
      url: '/build-error',
      buildError: expect.any(String),
    })

    // Check the build error contains the expected syntax error message
    expect(stripAnsi(errors.sessionErrors[0].buildError)).toContain(
      'Unexpected token. Did you mean'
    )
    expect(stripAnsi(errors.sessionErrors[0].buildError)).toContain(
      'build-error/page.tsx'
    )
  })

  it('should capture errors from multiple browser sessions', async () => {
    // Restart the server
    await next.stop()
    await next.start()

    // Open two independent browser sessions concurrently
    const [s1, s2] = await Promise.all([
      launchStandaloneSession(next.url, '/runtime-error'),
      launchStandaloneSession(next.url, '/runtime-error-2'),
    ])

    try {
      let errors: any = null
      await retry(async () => {
        const sessionId = 'test-multi-' + Date.now()
        const errorsText = await callGetErrors(sessionId)
        errors = JSON.parse(errorsText)
        // Check that we have at least the 2 sessions we created
        expect(errors.sessionErrors.length).toBeGreaterThanOrEqual(2)
        // Ensure both our sessions are present
        const urls = errors.sessionErrors.map((s: any) => s.url)
        expect(urls).toContain('/runtime-error')
        expect(urls).toContain('/runtime-error-2')
      })

      // Find each session's errors
      const session1 = errors.sessionErrors.find(
        (s: any) => s.url === '/runtime-error'
      )
      const session2 = errors.sessionErrors.find(
        (s: any) => s.url === '/runtime-error-2'
      )

      expect(session1).toMatchObject({
        url: '/runtime-error',
        runtimeErrors: [
          {
            type: 'runtime',
            message: 'Test runtime error',
            fatal: true,
            stack: expect.arrayContaining([
              expect.objectContaining({
                file: expect.stringContaining('app/runtime-error/page.tsx'),
                methodName: 'RuntimeErrorPage',
              }),
            ]),
          },
        ],
      })

      expect(session2).toMatchObject({
        url: '/runtime-error-2',
        runtimeErrors: [
          {
            type: 'runtime',
            message: 'Test runtime error 2',
            fatal: true,
            stack: expect.arrayContaining([
              expect.objectContaining({
                file: expect.stringContaining('app/runtime-error-2/page.tsx'),
                methodName: 'RuntimeErrorPage',
              }),
            ]),
          },
        ],
      })
    } finally {
      await s1.close()
      await s2.close()
    }
  })

  it('should capture next.config errors and clear when fixed', async () => {
    // Read the original config
    const originalConfig = await next.readFile('next.config.js')

    // Stop server, write invalid config, and restart
    await next.stop()
    await next.patchFile(
      'next.config.js',
      `module.exports = {
  experimental: {
    invalidTestProperty: 'this should cause a validation warning',
  },
}`
    )
    await next.start()

    // Open a browser session
    await next.browser('/')

    // Check that the config error is captured
    let errors: any = null
    await retry(async () => {
      const sessionId = 'test-config-error-' + Date.now()
      const errorsText = await callGetErrors(sessionId)
      errors = JSON.parse(errorsText)
      expect(errors.configErrors.length).toBeGreaterThan(0)
    })

    expect(errors.configErrors[0]).toMatchObject({
      message: expect.stringContaining(
        'Invalid next.config.js options detected'
      ),
    })
    expect(errors.configErrors[0].message).toContain('invalidTestProperty')

    // Stop server, fix the config, and restart
    await next.stop()
    await next.patchFile('next.config.js', originalConfig)
    await next.start()

    // Open a browser session
    await next.browser('/')

    // Verify the config error is now gone
    await retry(async () => {
      const sessionId = 'test-config-fixed-' + Date.now()
      const fixedErrorsText = await callGetErrors(sessionId)
      const fixedErrors = JSON.parse(fixedErrorsText)
      expect(fixedErrors.configErrors).toHaveLength(0)
      expect(fixedErrors.sessionErrors).toHaveLength(0)
    })
  })
})

/**
 * Minimal standalone browser session launcher for testing multiple concurrent browser tabs.
 * The standard test harness (next.browser) uses a singleton browser instance which doesn't
 * support concurrent tabs needed for testing errors across multiple browser sessions.
 */
async function launchStandaloneSession(
  appPortOrUrl: string | number,
  url: string,
  beforePageLoad?: (page: Page) => Promise<void>
) {
  const headless = !!process.env.HEADLESS
  const browserName = (process.env.BROWSER_NAME || 'chrome').toLowerCase()

  let browser: Browser
  if (browserName === 'safari') {
    browser = await webkit.launch({ headless })
  } else if (browserName === 'firefox') {
    browser = await firefox.launch({ headless })
  } else {
    browser = await chromium.launch({ headless })
  }

  const context = await browser.newContext()
  const page = await context.newPage()

  const fullUrl = getFullUrl(appPortOrUrl, url)
  debugPrint(`Loading standalone browser with ${fullUrl}`)

  page.on('pageerror', (error) => debugPrint('Standalone page error', error))
  await beforePageLoad?.(page)

  await page.goto(fullUrl, { waitUntil: 'load' })
  debugPrint(`Loaded standalone browser with ${fullUrl}`)

  return {
    page,
    close: async () => {
      await page.close().catch(() => {})
      await context.close().catch(() => {})
      await browser.close().catch(() => {})
    },
  }
}
