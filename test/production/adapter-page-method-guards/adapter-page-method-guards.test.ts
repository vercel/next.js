import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

// Adapters invoke the entrypoint `handler` of each build output directly,
// without NextServer. The method guards and not-found status that NextServer
// applies must also be applied by the entrypoints themselves.
//
// This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
// @force-gate !deploy
describe('adapter-page-method-guards', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // One launcher (deployed function) per build output, keyed by
  // `<outputs key>:<pathname>` as passed to `onBuildComplete`.
  const outputIds = [
    'appPages:/dynamic',
    'appPages:/static',
    'appPages:/500',
    'appPages:/_not-found',
    'appRoutes:/route-handler',
    'pages:/ssr',
    'pages:/ssg',
    'pages:/404',
    'pages:/_error',
    'pagesApi:/api/hello',
  ]
  const launchers = new Map<
    string,
    { process: ChildProcess; port: number; output: { value: string } }
  >()
  let requestCount = 0

  beforeAll(async () => {
    await next.build()

    for (const outputId of outputIds) {
      const port = await findPort()
      const output = { value: '' }
      const child = spawn(
        'node',
        [path.join(next.testDir, 'adapter-launcher.js'), outputId],
        {
          cwd: next.testDir,
          env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
          stdio: 'pipe',
        }
      )
      child.stdout?.on('data', (chunk) => (output.value += chunk))
      child.stderr?.on('data', (chunk) => (output.value += chunk))
      launchers.set(outputId, { process: child, port, output })
    }

    for (const [outputId, { output }] of launchers) {
      await retry(async () => {
        expect(output.value).toContain(`adapter launcher ready: ${outputId}`)
      })
    }
  })

  afterAll(() => {
    for (const { process } of launchers.values()) {
      process.kill()
    }
  })

  /**
   * Invokes the handler of a build output through its launcher and returns the
   * response together with the logs written while handling the request.
   */
  async function invoke(
    outputId: string,
    pathname: string,
    init: { method?: string; headers?: Record<string, string> } = {}
  ) {
    const launcher = launchers.get(outputId)
    if (!launcher) {
      throw new Error(`No launcher for ${outputId}`)
    }
    const { port, output } = launcher
    const requestId = String(++requestCount)
    const start = output.value.length
    const res = await fetch(`http://localhost:${port}${pathname}`, {
      method: init.method ?? 'GET',
      headers: { 'x-test-request-id': requestId, ...init.headers },
    })
    const body = await res.text()
    // The launcher logs this after the handler has finished, on the same
    // stream as the logs written while handling the request.
    await retry(async () => {
      expect(output.value.slice(start)).toContain(
        `__request-done__ ${requestId}\n`
      )
    })
    return { res, body, logs: output.value.slice(start) }
  }

  describe('OPTIONS on dynamic pages', () => {
    it('rejects OPTIONS on an app dynamic page without rendering', async () => {
      const { res, body, logs } = await invoke(
        'appPages:/dynamic',
        '/dynamic',
        {
          method: 'OPTIONS',
        }
      )
      expect(res.status).toBe(400)
      expect(body).toBe('')
      expect(logs).not.toContain('__app-dynamic-rendered__')
      expect(logs).not.toContain('__app-dynamic-metadata__')
    })

    it('still renders GET on an app dynamic page', async () => {
      const { res, body, logs } = await invoke('appPages:/dynamic', '/dynamic')
      expect(res.status).toBe(200)
      expect(body).toContain('app dynamic page')
      // Confirms that the logs asserted absent above are observable.
      expect(logs).toContain('__app-dynamic-rendered__')
      expect(logs).toContain('__app-dynamic-metadata__')
    })

    it('does not add method validation for other methods on an app dynamic page', async () => {
      const { res, body } = await invoke('appPages:/dynamic', '/dynamic', {
        method: 'PUT',
      })
      expect(res.status).toBe(200)
      expect(body).toContain('app dynamic page')
    })

    it('rejects OPTIONS on a pages SSR page without running getServerSideProps', async () => {
      const { res, body, logs } = await invoke('pages:/ssr', '/ssr', {
        method: 'OPTIONS',
      })
      expect(res.status).toBe(400)
      expect(body).toBe('')
      expect(logs).not.toContain('__pages-ssr-gssp__')
    })

    it('still renders GET on a pages SSR page', async () => {
      const { res, body, logs } = await invoke('pages:/ssr', '/ssr')
      expect(res.status).toBe(200)
      expect(body).toContain('pages ssr page')
      expect(logs).toContain('__pages-ssr-gssp__')
    })
  })

  describe('non-GET/HEAD on static pages', () => {
    it.each([
      ['appPages:/static', '/static'],
      ['pages:/ssg', '/ssg'],
    ])('returns 405 for %s', async (outputKey, pathname) => {
      for (const method of ['OPTIONS', 'POST']) {
        const { res, body } = await invoke(outputKey, pathname, { method })
        expect({ method, status: res.status }).toEqual({ method, status: 405 })
        expect(res.headers.get('allow')).toBe('GET, HEAD')
        expect(body).toBe('Method Not Allowed')
      }
    })

    it('does not reject a server action POST on a static app page with 405', async () => {
      const { res } = await invoke('appPages:/static', '/static', {
        method: 'POST',
        headers: {
          'next-action': 'does-not-exist',
          'content-type': 'text/plain;charset=UTF-8',
        },
      })
      expect(res.status).not.toBe(405)
    })

    it('does not return 405 for a static app /500 page, like NextServer', async () => {
      const { res } = await invoke('appPages:/500', '/500', { method: 'POST' })
      expect(res.status).not.toBe(405)
    })

    it('still rejects OPTIONS on a static app /500 page', async () => {
      const { res, body } = await invoke('appPages:/500', '/500', {
        method: 'OPTIONS',
      })
      expect(res.status).toBe(400)
      expect(body).toBe('')
    })
  })

  describe('not-found pages', () => {
    it.each(['GET', 'OPTIONS'])(
      'returns 404 for the app not-found entrypoint (%s)',
      async (method) => {
        const { res, body } = await invoke(
          'appPages:/_not-found',
          '/does-not-exist',
          { method, headers: { accept: 'text/html' } }
        )
        expect(res.status).toBe(404)
        expect(body).toContain('custom not found page')
      }
    )

    it.each(['GET', 'OPTIONS'])(
      'returns 404 for the pages /404 entrypoint (%s)',
      async (method) => {
        const { res, body } = await invoke('pages:/404', '/does-not-exist', {
          method,
          headers: { accept: 'text/html' },
        })
        expect(res.status).toBe(404)
        expect(body).toContain('pages custom 404')
      }
    )

    it('does not reject OPTIONS for pages /_error rendered with a 404 status', async () => {
      const { res } = await invoke('pages:/_error', '/does-not-exist', {
        method: 'OPTIONS',
        headers: { accept: 'text/html', 'x-test-preset-status': '404' },
      })
      expect(res.status).toBe(404)
    })
  })

  describe('routes that handle OPTIONS themselves', () => {
    it('auto-implements OPTIONS for app route handlers', async () => {
      const { res } = await invoke(
        'appRoutes:/route-handler',
        '/route-handler',
        {
          method: 'OPTIONS',
        }
      )
      expect(res.status).toBe(204)
    })

    it('passes OPTIONS through to pages API routes', async () => {
      const { res, body } = await invoke('pagesApi:/api/hello', '/api/hello', {
        method: 'OPTIONS',
      })
      expect(res.status).toBe(200)
      expect(JSON.parse(body)).toEqual({ method: 'OPTIONS' })
    })
  })
})
