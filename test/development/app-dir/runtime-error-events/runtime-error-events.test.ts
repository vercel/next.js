import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import WebSocket from 'ws'
import { chromium, firefox, webkit } from 'playwright'
import type { RuntimeErrorStateMessage } from 'next/dist/server/dev/hot-reloader-types'

async function observe(url: string) {
  const socket = new WebSocket(`${url.replace(/^http/, 'ws')}/_next/hmr`)
  const messages: RuntimeErrorStateMessage[] = []
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject)
    socket.on('message', (data) => {
      let message
      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }
      if (message.type === 'runtimeErrors') {
        messages.push(message)
      }
      if (message.type === 'sync') {
        resolve()
      }
    })
  })
  return { messages, socket, close: () => socket.terminate() }
}

async function waitForError(
  observer: Awaited<ReturnType<typeof observe>>,
  pathname: string,
  message: string,
  boundary: string | undefined,
  fatal = boundary === 'default-global' || boundary === 'custom-global'
) {
  let found: RuntimeErrorStateMessage | undefined
  await retry(() => {
    found = observer.messages.find(
      (state) =>
        state.pathname === pathname &&
        state.errors.some(
          (error) =>
            error.message === message &&
            error.fatal === fatal &&
            (boundary === undefined
              ? error.boundary === undefined
              : error.boundary?.kind === boundary)
        )
    )
    expect(found).toBeDefined()
  })
  return found!
}

describe('runtime-error-events', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: { experimental: { exposeRuntimeErrorsToHMR: true } },
  })

  it('pushes an initial render failure and resends it after reconnecting', async () => {
    const observer = await observe(next.url)
    try {
      let reconnect!: () => void
      const browser = await next.browser('/initial', {
        beforePageLoad(page) {
          return page.routeWebSocket(/\/_next\/hmr/, (client) => {
            const server = client.connectToServer()
            reconnect = () => {
              void server.close()
            }
          })
        },
      })
      const state = await waitForError(
        observer,
        '/initial',
        'initial render failed',
        'default-global'
      )
      expect(state.htmlRequestId).toBe(
        await browser.eval(() => Reflect.get(self, '__next_r'))
      )
      expect(
        state.errors.find((error) => error.message === 'initial render failed')!
          .stack
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: expect.stringContaining('app/initial/page.tsx'),
          }),
        ])
      )
      await retry(async () => {
        expect(
          await browser.elementByCss('html#__next_error__ h1').text()
        ).toBe('This page couldn’t load')
      })
      const previousCount = observer.messages.length
      reconnect()
      await retry(() => {
        expect(observer.messages.slice(previousCount)).toContainEqual(
          expect.objectContaining({
            htmlRequestId: state.htmlRequestId,
            pathname: '/initial',
            errors: expect.arrayContaining([
              expect.objectContaining({
                message: 'initial render failed',
                boundary: expect.objectContaining({ kind: 'default-global' }),
              }),
            ]),
          })
        )
      })
    } finally {
      observer.close()
    }
  })

  it.each([
    ['/segment', 'segment failed', 'Segment fallback'],
    ['/class', 'class failed', 'Class fallback'],
    ['/catch', 'catch failed', 'Catch fallback'],
  ])('reports a custom boundary at %s', async (pathname, message, fallback) => {
    const observer = await observe(next.url)
    try {
      const browser = await next.browser(pathname)
      if (pathname !== '/segment') {
        await browser.elementByCss('#throw').click()
      }
      await waitForError(observer, pathname, message, 'custom')
      expect(await browser.elementByCss('#fallback').text()).toBe(fallback)
    } finally {
      observer.close()
    }
  })

  it.each(['event', 'rejection'])(
    'reports %s errors without a catching boundary',
    async (kind) => {
      const observer = await observe(next.url)
      try {
        const browser = await next.browser('/events')
        await browser.elementByCss(`#${kind}`).click()
        await waitForError(observer, '/events', `${kind} failed`, undefined)
        expect(await browser.elementByCss('#content').text()).toBe(
          'Usable preview'
        )
      } finally {
        observer.close()
      }
    }
  )

  it('distinguishes custom global fallback from the default global fallback', async () => {
    await next.renameFile('app/global-error.bak', 'app/global-error.tsx')
    const observer = await observe(next.url)
    try {
      const browser = await next.browser('/render')
      await browser.elementByCss('#throw').click()
      await waitForError(observer, '/render', 'render failed', 'custom-global')
      expect(await browser.elementByCss('#fallback').text()).toBe(
        'Custom global fallback'
      )
    } finally {
      observer.close()
      await next.renameFile('app/global-error.tsx', 'app/global-error.bak')
    }
  })

  it('reports the default boundary when the custom global fallback itself throws', async () => {
    await next.renameFile('app/global-error.bak', 'app/global-error.tsx')
    const original = await next.readFile('app/global-error.tsx')
    const observer = await observe(next.url)
    try {
      await next.patchFile(
        'app/global-error.tsx',
        original.replace(
          'return <html>',
          "throw new Error('global fallback failed'); return <html>"
        )
      )
      const browser = await next.browser('/render')
      await browser.elementByCss('#throw').click()
      await waitForError(
        observer,
        '/render',
        'global fallback failed',
        'default-global'
      )
      await retry(async () => {
        expect(
          await browser.elementByCss('html#__next_error__ h1').text()
        ).toBe('This page couldn’t load')
      })
    } finally {
      observer.close()
      await next.patchFile('app/global-error.tsx', original)
      await next.renameFile('app/global-error.tsx', 'app/global-error.bak')
    }
  })

  it('identifies two previews at the same pathname and replays state to late observers', async () => {
    const browserName = (process.env.BROWSER_NAME || 'chrome').toLowerCase()
    const browserType =
      browserName === 'safari'
        ? webkit
        : browserName === 'firefox'
          ? firefox
          : chromium
    const browser = await browserType.launch({
      headless: !!process.env.HEADLESS,
    })
    const firstContext = await browser.newContext()
    const secondContext = await browser.newContext()
    const observer = await observe(next.url)
    let lateObserver: Awaited<ReturnType<typeof observe>> | undefined
    try {
      const first = await firstContext.newPage()
      const second = await secondContext.newPage()
      await first.goto(`${next.url}/events`)
      await second.goto(`${next.url}/events`)
      const firstId = await first.evaluate(() => Reflect.get(self, '__next_r'))
      const secondId = await second.evaluate(() =>
        Reflect.get(self, '__next_r')
      )
      expect(firstId).not.toBe(secondId)
      await first.locator('#event').click()
      await second.locator('#rejection').click()
      await retry(() => {
        for (const [id, message] of [
          [firstId, 'event failed'],
          [secondId, 'rejection failed'],
        ]) {
          expect(observer.messages).toContainEqual(
            expect.objectContaining({
              pathname: '/events',
              htmlRequestId: id,
              errors: expect.arrayContaining([
                expect.objectContaining({ message }),
              ]),
            })
          )
        }
      })
      lateObserver = await observe(next.url)
      expect(
        new Set(
          lateObserver.messages
            .filter((state) => state.pathname === '/events')
            .map((state) => state.htmlRequestId)
        )
      ).toEqual(new Set([firstId, secondId]))
      const disconnectOffset = observer.messages.length
      await firstContext.close()
      await retry(() => {
        expect(observer.messages.slice(disconnectOffset)).toContainEqual(
          expect.objectContaining({ htmlRequestId: firstId, errors: [] })
        )
      })
      lateObserver.close()
      lateObserver = await observe(next.url)
      expect(
        lateObserver.messages.filter((state) => state.htmlRequestId === firstId)
      ).toEqual([])
      expect(lateObserver.messages).toContainEqual(
        expect.objectContaining({
          htmlRequestId: secondId,
          errors: expect.arrayContaining([
            expect.objectContaining({ message: 'rejection failed' }),
          ]),
        })
      )
    } finally {
      observer.close()
      lateObserver?.close()
      await browser.close()
    }
  })
  it('clears reported errors after an edit', async () => {
    const observer = await observe(next.url)
    const original = await next.readFile('app/render/page.tsx')
    try {
      const browser = await next.browser('/render')
      await browser.elementByCss('#throw').click()
      const state = await waitForError(
        observer,
        '/render',
        'render failed',
        'default-global'
      )
      const previousCount = observer.messages.length
      await next.patchFile(
        'app/render/page.tsx',
        original.replace(
          "throw new Error('render failed')",
          'return <p id="fixed">Fixed</p>'
        )
      )
      await retry(() => {
        expect(observer.messages.slice(previousCount)).toContainEqual(
          expect.objectContaining({ clientId: state.clientId, errors: [] })
        )
      })
      await retry(async () => {
        expect(
          await browser.eval(
            () =>
              document.querySelector('#fixed')?.textContent ||
              document.querySelector('#throw')?.textContent
          )
        ).toMatch(/Fixed|Throw/)
      })
    } finally {
      observer.close()
      await next.patchFile('app/render/page.tsx', original)
    }
  })

  it('clears server-only errors without reloading the document', async () => {
    const observer = await observe(next.url)
    const original = await next.readFile('app/server-console/page.tsx')
    let lateObserver: Awaited<ReturnType<typeof observe>> | undefined
    try {
      const browser = await next.browser('/server-console')
      const state = await waitForError(
        observer,
        '/server-console',
        'server console failed',
        undefined
      )
      const documentId = await browser.eval(() => Reflect.get(self, '__next_r'))
      const previousCount = observer.messages.length
      await next.patchFile(
        'app/server-console/page.tsx',
        original
          .replace("console.error(new Error('server console failed'))", '')
          .replace('Before edit', 'After edit')
      )
      await retry(async () => {
        expect(await browser.elementByCss('#content').text()).toBe('After edit')
        expect(observer.messages.slice(previousCount)).toContainEqual(
          expect.objectContaining({ clientId: state.clientId, errors: [] })
        )
      })
      expect(await browser.eval(() => Reflect.get(self, '__next_r'))).toBe(
        documentId
      )
      lateObserver = await observe(next.url)
      expect(
        lateObserver.messages.filter(
          (message) => message.htmlRequestId === documentId
        )
      ).toEqual([])

      // Clearing must also reset deduplication so the same error can recur.
      const clearedCount = observer.messages.length
      await next.patchFile('app/server-console/page.tsx', original)
      await retry(() => {
        expect(observer.messages.slice(clearedCount)).toContainEqual(
          expect.objectContaining({
            clientId: state.clientId,
            errors: expect.arrayContaining([
              expect.objectContaining({ message: 'server console failed' }),
            ]),
          })
        )
      })
    } finally {
      observer.close()
      lateObserver?.close()
      await next.patchFile('app/server-console/page.tsx', original)
    }
  })

  it('deduplicates Strict Mode render errors in the reported snapshot', async () => {
    const observer = await observe(next.url)
    try {
      await next.browser('/strict-mode')
      const state = await waitForError(
        observer,
        '/strict-mode',
        'strict render complete',
        undefined
      )
      expect(
        state.errors.filter((error) => error.message === 'strict render failed')
      ).toHaveLength(1)
    } finally {
      observer.close()
    }
  })
  it('republishes current state after client navigation', async () => {
    const observer = await observe(next.url)
    try {
      const browser = await next.browser('/navigation/next')
      await browser.loadPage(`${next.url}/navigation`)
      const marker = await browser.eval(() => {
        ;(window as any).__navigationMarker = Math.random()
        return (window as any).__navigationMarker
      })
      await browser.elementByCss('#log').click()
      const initial = await waitForError(
        observer,
        '/navigation',
        'navigation error',
        undefined
      )
      observer.messages.length = 0
      await browser.eval(() => document.getElementById('navigate')!.click())
      await retry(() => {
        expect(observer.messages).toContainEqual(
          expect.objectContaining({
            pathname: '/navigation/next',
            clientId: initial.clientId,
            errors: expect.arrayContaining([
              expect.objectContaining({ message: 'navigation error' }),
            ]),
          })
        )
      })
      expect(await browser.eval(() => (window as any).__navigationMarker)).toBe(
        marker
      )
    } finally {
      observer.close()
    }
  })

  it('retains boundary metadata when a previously logged Error is thrown', async () => {
    const observer = await observe(next.url)
    try {
      const browser = await next.browser('/reused')
      await browser.elementByCss('#log').click()
      await waitForError(observer, '/reused', 'reused error', undefined)
      await browser.elementByCss('#throw').click()
      const state = await waitForError(
        observer,
        '/reused',
        'reused error',
        'custom'
      )
      expect(state.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: 'reused error', type: 'console' }),
          expect.objectContaining({
            message: 'reused error',
            type: 'runtime',
            boundary: { kind: 'custom', name: 'Boundary' },
          }),
        ])
      )
      expect(await browser.elementByCss('#fallback').text()).toBe('Caught')
    } finally {
      observer.close()
    }
  })

  it('keeps hydration recovery distinct from an uncaught error', async () => {
    const observer = await observe(next.url)
    try {
      const browser = await next.browser('/hydration')
      await retry(() => {
        const errors = observer.messages
          .filter((state) => state.pathname === '/hydration')
          .flatMap((state) => state.errors)
        const error = errors.find((error) => error.type === 'recoverable')
        expect(error).toBeDefined()
        expect(error!.fatal).toBe(false)
        expect(error!.boundary).toBeUndefined()
      })
      expect(await browser.elementByCss('#content').text()).toBe('client text')
    } finally {
      observer.close()
    }
  })

  it('reports a non-Error App Router render failure', async () => {
    const observer = await observe(next.url)
    try {
      await next.browser('/non-error')
      const state = await waitForError(
        observer,
        '/non-error',
        'non-Error render failed',
        'default-global'
      )
      const error = state.errors.find(
        (error) => error.message === 'non-Error render failed'
      )!
      expect(error.errorName).toBe('Error')
    } finally {
      observer.close()
    }
  })

  it('reports Next root callback failures as fatal without a catching boundary', async () => {
    const observer = await observe(next.url)
    try {
      const browser = await next.browser('/uncaught')
      await browser.elementByCss('#throw').click()
      await waitForError(
        observer,
        '/uncaught',
        'uncaught root failed',
        undefined,
        true
      )
      expect(await browser.elementByCss('#content').text()).toBe(
        'Main app still mounted'
      )
    } finally {
      observer.close()
    }
  })
  it('republishes an unchanged empty snapshot on navigation', async () => {
    const observer = await observe(next.url)
    try {
      const browser = await next.browser('/navigation')
      let initial: RuntimeErrorStateMessage | undefined
      await retry(() => {
        initial = observer.messages.find(
          (state) =>
            state.pathname === '/navigation' && state.errors.length === 0
        )
        expect(initial).toBeDefined()
      })
      observer.messages.length = 0
      await browser.elementByCss('#navigate').click()
      await retry(() => {
        expect(observer.messages).toContainEqual(
          expect.objectContaining({
            pathname: '/navigation/next',
            clientId: initial!.clientId,
            errors: [],
          })
        )
      })
    } finally {
      observer.close()
    }
  })
  it('promotes a logged error to fatal while preserving its boundary', async () => {
    const observer = await observe(next.url)
    try {
      const browser = await next.browser('/promote')
      await browser.elementByCss('#log').click()
      await waitForError(
        observer,
        '/promote',
        'promoted error',
        undefined,
        false
      )
      await browser.elementByCss('#throw').click()
      const state = await waitForError(
        observer,
        '/promote',
        'promoted error',
        'default-global',
        true
      )
      expect(
        state.errors.filter((error) => error.message === 'promoted error')
      ).toHaveLength(1)
    } finally {
      observer.close()
    }
  })
})

describe.each([undefined, false])('runtime-error-events flag %s', (enabled) => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: { experimental: { exposeRuntimeErrorsToHMR: enabled } },
  })

  it('preserves overlay deduplication and MCP output without reporting runtime events', async () => {
    const observer = await observe(next.url)
    try {
      const browser = await next.browser('/reused')
      await browser.elementByCss('#log').click()
      await browser.elementByCss('#throw').click()
      expect(await browser.elementByCss('#fallback').text()).toBe('Caught')

      observer.socket.send(
        JSON.stringify({
          event: 'runtimeErrors',
          pathname: '/injected',
          errorState: {
            routerType: 'app',
            errors: [
              {
                id: 1,
                type: 'runtime',
                fatal: true,
                error: {
                  name: 'Error',
                  message: 'must not publish',
                  source: null,
                },
                frames: [],
              },
            ],
          },
        })
      )
      await new Promise<void>((resolve) => {
        observer.socket.once('pong', () => resolve())
        observer.socket.ping()
      })

      await retry(async () => {
        const response = await fetch(`${next.url}/_next/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'flag-off',
            method: 'tools/call',
            params: { name: 'get_errors', arguments: {} },
          }),
        })
        const match = (await response.text()).match(/data: ({.*})/s)
        const errors = JSON.parse(JSON.parse(match![1]).result.content[0].text)
        const session = errors.sessionErrors.find(
          (entry: { url: string }) => entry.url === '/reused'
        )
        expect(session.runtimeErrors).toHaveLength(1)
        expect(session.runtimeErrors[0].message).toBe('reused error')
        expect(session.runtimeErrors[0]).not.toHaveProperty('fatal')
        expect(session.runtimeErrors[0]).not.toHaveProperty('boundary')
      })
      expect(observer.messages).toEqual([])
      const lateObserver = await observe(next.url)
      try {
        expect(lateObserver.messages).toEqual([])
      } finally {
        lateObserver.close()
      }
    } finally {
      observer.close()
    }
  })
})
