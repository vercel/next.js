import { nextTestSetup } from 'e2e-utils'
import { fetchViaRawHttp, findPort, retry } from 'next-test-utils'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { once } from 'events'
import { request } from 'http'
import cheerio from 'cheerio'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param'

type NextInstance = ReturnType<typeof nextTestSetup>['next']

/**
 * Rebuilds with an adapter, then runs the emitted Go middleware executable
 * the way a hosting platform does: directly, with original request URLs.
 */
async function withAdapterProxy(
  next: NextInstance,
  callback: (origin: string) => Promise<void>
) {
  await next.stop()
  const config = await next.readFile('next.config.ts')
  await next.patchFile(
    'next.config.ts',
    config.replace(
      'experimental: {',
      `adapterPath: ${JSON.stringify(join(next.testDir, 'capture-adapter.mjs'))}, experimental: {`
    )
  )
  await next.build()
  const output = JSON.parse(await next.readFile('go-proxy-output.json'))
  const directory = await fs.mkdtemp(join(tmpdir(), 'go-proxy-function-'))
  const binary = join(
    directory,
    process.platform === 'win32' ? 'user-server.exe' : 'user-server'
  )
  await fs.copyFile(output.filePath, binary)
  await fs.chmod(binary, 0o755)
  const port = await findPort()
  const child = spawn(binary, [], {
    cwd: directory,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  })
  const origin = `http://127.0.0.1:${port}`
  try {
    await retry(async () => {
      const response = await fetch(`${origin}/native-proxy/inspect`)
      expect(response.headers.get('x-middleware-next')).toBe('1')
    })
    await callback(origin)
  } finally {
    const exited = once(child, 'exit')
    child.kill()
    await exited
    await fs.rm(directory, { recursive: true, force: true })
  }
}

// Hosted tests require the Go proxy adapter and builder releases.
// @force-gate turbopack && !deploy
describe('native-proxy-go', () => {
  const { next, isNextStart } = nextTestSetup({ files: __dirname })

  it('continues to a JS handler and matches all paths', async () => {
    const response = await next.fetch('/native-proxy/inspect')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-go-proxy')).toBe('yes')
    expect((await next.fetch('/')).headers.get('x-go-proxy')).toBe('yes')
  })

  it('runs without a JavaScript middleware entry', async () => {
    await expect(next.readFile('.next/server/middleware.js')).rejects.toThrow()
    await expect(
      next.readFile('.next/server/middleware.js.nft.json')
    ).rejects.toThrow()
    if (isNextStart) {
      const manifest = JSON.parse(
        await next.readFile('.next/server/functions-config-manifest.json')
      )
      expect(manifest.functions['/_middleware']).toMatchObject({
        runtime: 'go',
        nativeEntry: 'middleware.native.json',
      })
    }
    expect(
      (await next.fetch('/native-proxy/inspect')).headers.get('x-go-proxy')
    ).toBe('yes')
  })

  // Runtime changes and removal are development-only operations.
  // @force-gate dev
  it('switches between Go, Node.js, and Edge middleware and clears removed entries', async () => {
    const proxy = await next.readFile('proxy.go')
    const response = () => next.fetch('/native-proxy/inspect')
    try {
      await next.deleteFile('proxy.go')
      await retry(async () => {
        const res = await response()
        expect(res.status).toBe(200)
        expect(res.headers.get('x-go-proxy')).toBeNull()
      }, 15000)
      await next.patchFile(
        'proxy.ts',
        `import { NextResponse } from 'next/server'
         export function proxy() {
           const response = NextResponse.next()
           response.headers.set('x-js-proxy', 'yes')
           return response
         }`
      )
      await retry(async () => {
        const res = await response()
        expect(res.status).toBe(200)
        expect(res.headers.get('x-js-proxy')).toBe('yes')
        expect(res.headers.get('x-go-proxy')).toBeNull()
      }, 15000)
      await next.deleteFile('proxy.ts')
      await next.patchFile(
        'middleware.ts',
        `import { NextResponse } from 'next/server'
         export function middleware() {
           const response = NextResponse.next()
           response.headers.set('x-edge-proxy', 'yes')
           return response
         }`
      )
      await retry(async () => {
        const res = await response()
        expect(res.status).toBe(200)
        expect(res.headers.get('x-edge-proxy')).toBe('yes')
        expect(res.headers.get('x-js-proxy')).toBeNull()
        expect(res.headers.get('x-go-proxy')).toBeNull()
      }, 15000)
      await next.deleteFile('middleware.ts')
      await next.patchFile('proxy.go', proxy)
      await retry(async () => {
        const res = await response()
        expect(res.status).toBe(200)
        expect(res.headers.get('x-go-proxy')).toBe('yes')
        expect(res.headers.get('x-js-proxy')).toBeNull()
        expect(res.headers.get('x-edge-proxy')).toBeNull()
      }, 15000)
      await next.patchFile('proxy.go', proxy.replace('"yes"', '"edited"'))
      await retry(async () => {
        expect((await response()).headers.get('x-go-proxy')).toBe('edited')
      }, 15000)
    } finally {
      await next.deleteFile('proxy.ts')
      await next.deleteFile('middleware.ts')
      await next.patchFile('proxy.go', proxy)
      await retry(async () => {
        expect((await response()).headers.get('x-go-proxy')).toBe('yes')
      }, 15000)
    }
  })

  it.each([undefined, 'Mon, 01 Jan 2001 00:00:00 GMT'])(
    'preserves the downstream request Date: %s',
    async (date) => {
      for (const path of ['/native-proxy/inspect', '/native-proxy/override']) {
        const response = await next.fetch(path, {
          headers: date ? { date } : {},
        })
        expect(await response.json()).toMatchObject({ date: date ?? null })
      }
    }
  )

  it('preserves an explicitly set proxy response Date', async () => {
    const date = 'Tue, 02 Jan 2001 00:00:00 GMT'
    const query = new URLSearchParams({ 'response-date': date })
    const response = await next.fetch(`/native-proxy/override?${query}`, {
      headers: { date: 'Mon, 01 Jan 2001 00:00:00 GMT' },
    })
    expect(await response.json()).toMatchObject({ date })
  })

  it('returns a terminal response', async () => {
    const response = await next.fetch('/native-proxy/blocked')
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('blocked by Go\n')
  })

  it.each(['/native-proxy/secure', '/native-proxy/secure.rsc'])(
    'protects the secure page through %s',
    async (path) => {
      const response = await next.fetch(path)
      expect(response.status).toBe(403)
      expect(await response.text()).toBe('protected\n')
    }
  )

  it('serves compressed terminal responses', async () => {
    // Middleware response processing strips encoded-body headers, so the body
    // must be decoded before reaching the client.
    const response = await next.fetch('/native-proxy/compressed')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('compressed by Go')
  })

  it.each(['POST', 'DELETE'])(
    'replays a large unread %s body',
    async (method) => {
      const body = 'a'.repeat(600 * 1024)
      const response = await next.fetch('/native-proxy/inspect', {
        method,
        body,
      })
      expect(response.status).toBe(200)
      expect((await response.json()).body).toBe(body)
      expect((await next.fetch('/native-proxy/inspect')).status).toBe(200)
    }
  )

  it('preserves the original Host for authorization and downstream handlers', async () => {
    const inspection = await fetchViaRawHttp(
      next.url,
      '/native-proxy/inspect',
      { headers: { host: 'admin.example.test' } }
    )
    expect(await inspection.json()).toMatchObject({
      host: 'admin.example.test',
    })
    expect(inspection.headers.get('x-go-host')).toBe('admin.example.test')

    const denied = await fetchViaRawHttp(next.url, '/native-proxy/host-gate')
    expect(denied.status).toBe(403)

    const response = await fetchViaRawHttp(
      next.url,
      '/native-proxy/host-gate',
      {
        headers: { host: 'admin.example.test' },
      }
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ method: 'GET' })
  })

  it('rewrites paths and queries', async () => {
    const response = await next.fetch('/native-proxy/rewrite')
    expect(response.status).toBe(200)
    const $ = cheerio.load(await response.text())
    expect(JSON.parse($('#query').text())).toEqual({ rewritten: '1' })
  })

  it('redirects without following the destination', async () => {
    const response = await next.fetch('/native-proxy/redirect', {
      redirect: 'manual',
    })
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toMatch(/\/native-proxy\/inspect$/)
  })

  it('overrides and removes downstream request headers', async () => {
    const response = await next.fetch('/native-proxy/override', {
      headers: { 'x-client-remove': 'remove me' },
    })
    expect(await response.json()).toMatchObject({
      fromGo: 'overridden',
      removed: null,
    })
  })

  it.each([
    { helper: 'Next', mode: 'nil' },
    { helper: 'Next', mode: 'replace' },
    { helper: 'Next', mode: 'empty' },
    { helper: 'Rewrite', mode: 'nil' },
    { helper: 'Rewrite', mode: 'replace' },
    { helper: 'Rewrite', mode: 'empty' },
  ])(
    '$helper applies ProxyOptions with $mode request headers',
    async ({ helper, mode }) => {
      const query = new URLSearchParams({
        headers: mode,
        rewrite: helper === 'Rewrite' ? '1' : '0',
      })
      const response = await next.fetch(`/native-proxy/options?${query}`, {
        method: 'DELETE',
        headers: { 'x-from-go': 'client', 'x-client-remove': 'original' },
        body: 'body with request header options',
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('x-go-proxy')).toBe('yes')
      expect(await response.json()).toMatchObject({
        method: 'DELETE',
        body: 'body with request header options',
        fromGo:
          mode === 'nil' ? 'client' : mode === 'replace' ? 'options' : null,
        removed: mode === 'nil' ? 'original' : null,
      })
    }
  )

  it.each(['Next', 'Rewrite'])(
    '%s preserves Flight headers when replacing request headers with an empty set',
    async (helper) => {
      const routerStateTree = encodeURIComponent(JSON.stringify(['', {}]))
      const query = new URLSearchParams({
        headers: 'empty',
        rewrite: helper === 'Rewrite' ? '1' : '0',
        _rsc: await computeCacheBustingSearchParam(
          '1',
          '/_tree',
          routerStateTree,
          undefined
        ),
      })
      const response = await next.fetch(`/native-proxy/options?${query}`, {
        redirect: 'manual',
        headers: {
          rsc: '1',
          'next-router-state-tree': routerStateTree,
          'next-router-prefetch': '1',
          'next-hmr-refresh': '1',
          'next-router-segment-prefetch': '/_tree',
          'x-client-remove': 'remove me',
        },
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        removed: null,
        flight: {
          rsc: '1',
          routerStateTree,
          prefetch: '1',
          hmrRefresh: '1',
          segmentPrefetch: '/_tree',
        },
      })
    }
  )

  it.each(['next', 'rewrite'])(
    'rejects multiple options for %s without stopping the worker',
    async (helper) => {
      expect(
        (await next.fetch(`/native-proxy/invalid-${helper}-options`)).status
      ).toBe(500)
      const following = await next.fetch('/native-proxy/inspect')
      expect(following.status).toBe(200)
      expect(following.headers.get('x-go-proxy')).toBe('yes')
    }
  )

  it('preserves repeated cookies', async () => {
    const response = await next.fetch('/native-proxy/cookies')
    expect(response.headers.get('set-cookie')).toContain('first=one')
    expect(response.headers.get('set-cookie')).toContain('second=two')
  })

  it.each([
    { path: 'cookie-state', override: '0' },
    { path: 'cookie-state', override: '1' },
    { path: 'cookie-rewrite', override: '0' },
    { path: 'cookie-rewrite', override: '1' },
  ])(
    'exposes proxy cookies in the same render for $path (header override: $override)',
    async ({ path, override }) => {
      const response = await next.fetch(
        `/native-proxy/${path}?override=${override}`,
        {
          headers: { cookie: 'first=old; untouched=kept' },
        }
      )
      expect(response.status).toBe(200)
      const cookies = response.headers.getSetCookie()
      expect(cookies).toEqual([
        expect.stringContaining('first=fresh;'),
        expect.stringContaining('second=new;'),
        expect.stringContaining('expiring=value;'),
      ])
      expect(cookies[0]).toContain('HttpOnly')
      expect(cookies[2]).toContain('Expires=Tue, 02 Jan 2035 03:04:05 GMT')
      expect(response.headers.get('x-middleware-set-cookie')).toBeNull()

      const $ = cheerio.load(await response.text())
      expect(JSON.parse($('#cookie-state').text())).toEqual({
        first: 'fresh',
        second: 'new',
        expiring: 'value',
        untouched: 'kept',
      })
    }
  )

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'replays a %s body consumed by Go and serves the following request',
    async (method) => {
      const response = await next.fetch('/native-proxy/body', {
        method,
        body: 'hello from ' + method,
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('x-go-body')).toBe('hello from ' + method)
      expect(await response.json()).toMatchObject({
        method,
        body: 'hello from ' + method,
      })
      const following = await next.fetch('/native-proxy/inspect')
      expect(following.status).toBe(200)
      expect(following.headers.get('x-go-proxy')).toBe('yes')
    }
  )

  it.each(['?new=1', './target?new=1', '#section'])(
    'resolves relative redirects from the raw request URL: %s',
    async (destination) => {
      const query = new URLSearchParams({
        old: '1',
        'relative-location': destination,
      })
      const path = `/native-proxy/a%2Fb?${query}`
      const response = await next.fetch(path, { redirect: 'manual' })
      expect(response.status).toBe(307)
      const expected = new URL(destination, new URL(path, next.url))
      const actual = new URL(response.headers.get('location')!, next.url)
      expect(actual.pathname).toBe(expected.pathname)
      expect(actual.search).toBe(expected.search)
      expect(actual.hash).toBe(expected.hash)
    }
  )

  it('resolves relative rewrite paths without decoding encoded separators', async () => {
    const query = new URLSearchParams({ 'relative-rewrite': './inspect' })
    const response = await next.fetch(`/native-proxy/a%2Fb?${query}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ method: 'GET' })
    const encodedQuery = new URLSearchParams({ 'relative-rewrite': '?new=1' })
    const encoded = await next.fetch(`/api%2Fproxy-query?${encodedQuery}`)
    expect(encoded.status).toBe(404)
  })

  it('preserves streaming terminal responses', async () => {
    const response = await next.fetch('/native-proxy/stream')
    expect(response.status).toBe(201)
    expect(await response.text()).toBe('first\n' + 'go'.repeat(1000))
  })

  it('does not expose private worker authentication metadata', async () => {
    const response = await next.fetch('/native-proxy/inspect', {
      headers: {
        'x-next-internal-go-token': 'forged',
        'x-next-internal-go-rewrite-host': 'forged.example.test',
        'x-next-internal-test': 'internal value',
      },
    })
    expect(response.headers.get('x-private-token')).toBe('false')
  })

  // Artifact inspection and executing a build-host binary are self-hosted checks.
  if (isNextStart) {
    it('emits a Go middleware output whose PORT server runs without Next.js', async () => {
      await withAdapterProxy(next, async (origin) => {
        // Like Node.js proxies, Go proxies register no Edge functions.
        const middlewareManifest = JSON.parse(
          await next.readFile(
            '.next/server/middleware/middleware-manifest.json'
          )
        )
        expect(middlewareManifest.middleware).toEqual({})
        expect(middlewareManifest.functions).toEqual({})
        const output = JSON.parse(await next.readFile('go-proxy-output.json'))
        expect(output).toMatchObject({
          type: 'MIDDLEWARE',
          runtime: 'go',
          id: '/_middleware',
          pathname: '/_middleware',
          sourcePage: '/proxy',
        })
        expect(output.config.matchers).toEqual([
          expect.objectContaining({ source: '/:path*' }),
        ])
        const appPages = JSON.parse(
          await next.readFile('go-app-pages-output.json')
        )
        expect(appPages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ pathname: '/native-proxy/secure.rsc' }),
          ])
        )
        const rewrite = await fetch(`${origin}/native-proxy/rewrite`)
        expect(rewrite.headers.get('x-middleware-rewrite')).toBe(
          `${origin}/api/proxy-query?rewritten=1`
        )
        const body = await fetch(`${origin}/native-proxy/body`, {
          method: 'POST',
          body: 'hosted body',
        })
        expect(body.headers.get('x-go-body')).toBe('hosted body')
        for (const path of [
          '/native-proxy/secure',
          '/native-proxy/secure.rsc',
        ]) {
          const response = await fetch(`${origin}${path}`)
          expect(response.status).toBe(403)
          expect(response.headers.get('x-middleware-next')).toBeNull()
        }
        for (const path of ['cookie-state', 'cookie-rewrite']) {
          const response = await fetch(`${origin}/native-proxy/${path}`)
          const cookies = response.headers.getSetCookie()
          expect(cookies).toHaveLength(3)
          expect(response.headers.get('x-middleware-set-cookie')).toBe(
            cookies.join(',')
          )
        }
        for (const [parameter, header] of [
          ['relative-location', 'location'],
          ['relative-rewrite', 'x-middleware-rewrite'],
        ]) {
          for (const destination of ['?new=1', './target?new=1', '#section']) {
            const url = new URL(`${origin}/native-proxy/a%2Fb`)
            url.search = new URLSearchParams({
              old: '1',
              [parameter]: destination,
            }).toString()
            // Only Next.js may choose the resolution host. A forged internal
            // header must not turn this into an external destination.
            const response = await fetch(url, {
              redirect: 'manual',
              headers: { 'x-next-internal-go-rewrite-host': 'evil.example' },
            })
            expect(response.headers.get(header)).toBe(
              new URL(destination, url).href
            )
          }
        }
        const forged = await fetch(`${origin}/native-proxy/inspect`, {
          headers: { 'x-next-internal-test': 'internal value' },
        })
        expect(forged.headers.get('x-private-token')).toBe('false')
      })
    })
  }
  it('identifies conflicting Proxy files', async () => {
    await next.stop()
    await next.patchFile('proxy.ts', 'export function proxy() {}')
    try {
      const [result] = await Promise.allSettled([next.start()])
      if (isNextStart) expect(result.status).toBe('rejected')
      // Dev may announce readiness before the watch aggregation reports it.
      await retry(() => {
        expect(next.cliOutput).toContain('Multiple Proxy files detected')
        expect(next.cliOutput).toContain('./proxy.go')
        expect(next.cliOutput).toContain('./proxy.ts')
      })
    } finally {
      await next.deleteFile('proxy.ts')
    }
  })

  it('ignores proxy.go unless experimental.goRoutes is enabled', async () => {
    // An unrelated Go file at the root must not affect JavaScript proxies.
    await next.stop()
    const config = await next.readFile('next.config.ts')
    await next.patchFile(
      'next.config.ts',
      config.replace('goRoutes: true', 'goRoutes: false')
    )
    await next.patchFile(
      'proxy.ts',
      `import { NextResponse } from 'next/server'
       export function proxy() {
         const response = NextResponse.next()
         response.headers.set('x-js-proxy', 'yes')
         return response
       }`
    )
    try {
      await next.start()
      const response = await next.fetch('/native-proxy/inspect')
      expect(response.status).toBe(200)
      expect(response.headers.get('x-js-proxy')).toBe('yes')
      expect(response.headers.get('x-go-proxy')).toBeNull()
      expect(next.cliOutput).not.toContain('Multiple Proxy files detected')
    } finally {
      await next.stop()
      await next.deleteFile('proxy.ts')
      await next.patchFile('next.config.ts', config)
    }
  })
})

// Hosted tests require the Go proxy adapter and builder releases.
// @force-gate turbopack && !deploy
describe.each(['', '/docs'])(
  'native-proxy-go request URLs with basePath "%s"',
  (basePath) => {
    const { next } = nextTestSetup({ files: __dirname, skipStart: true })

    // Transport forms are passed to the proxy as proxy.ts receives them.
    const paths = [
      '',
      '/native-proxy/inspect',
      '/native-proxy/inspect?x=1',
      '/native-proxy/inspect.rsc',
      '/native-proxy/inspect.rsc?x=1',
      '/native-proxy/inspect?q=a.rsc',
      '/native-proxy/a.rsc.rsc',
      '/native-proxy/inspect%2Ersc',
      '/native-proxy/a%2Fb',
      '/native-proxy/inspect.segments/_tree.segment.rsc',
      '/native-proxy/inspect.segments/$c$children/__PAGE__.segment.rsc',
      '/_next/data/build-id/native-proxy/inspect.json',
      '/_next/data/build-id/index/native-proxy/inspect.json',
      '/en/native-proxy/inspect',
      '/index.rsc',
      '/native-proxy/x/../inspect',
      '/native-proxy/x/%2e%2e/inspect',
      '/native-proxy/inspect?',
      '/native-proxy/inspect?_rsc=abc&a=1',
      '/native-proxy/inspect?nxtPslug=a&slug=b',
      '/native-proxy/inspect?a+b=c%20d&e',
      '/native-proxy/caf%C3%A9|x',
    ].map((path) => basePath + path || '/')

    async function receivedURLs(origin: string) {
      const received: Record<string, string | null> = {}
      for (const path of paths) {
        // Send the raw path, without client-side URL normalization.
        const response = await fetchViaRawHttp(origin, path)
        received[path] = response.headers.get('x-go-url')
      }
      return received
    }

    // Executing a build-host binary is a self-hosted check.
    // @force-gate start
    it('passes proxy.go the same URLs as proxy.ts in next start and adapter builds', async () => {
      const config = await next.readFile('next.config.ts')
      const proxy = await next.readFile('proxy.go')
      const withBasePath = config.replace(
        'experimental: {',
        `basePath: ${JSON.stringify(basePath)}, experimental: {`
      )
      try {
        await next.patchFile('next.config.ts', withBasePath)
        await next.start()
        const goStart = await receivedURLs(next.url)
        let goAdapter: Record<string, string | null> | undefined
        await withAdapterProxy(next, async (origin) => {
          goAdapter = await receivedURLs(origin)
        })

        await next.stop()
        await next.patchFile('next.config.ts', withBasePath)
        await next.deleteFile('proxy.go')
        await next.patchFile(
          'proxy.ts',
          `import { NextResponse, type NextRequest } from 'next/server'
           export function proxy(request: NextRequest) {
             const url = new URL(request.url)
             const response = NextResponse.next()
             response.headers.set('x-go-url', url.pathname + url.search)
             return response
           }`
        )
        await next.start()
        const tsStart = await receivedURLs(next.url)

        expect(tsStart).toMatchObject({
          [`${basePath}/native-proxy/inspect.rsc?x=1`]: `${basePath}/native-proxy/inspect?x=1`,
          [`${basePath}/native-proxy/inspect.segments/_tree.segment.rsc`]: `${basePath}/native-proxy/inspect.segments/_tree.segment`,
          [`${basePath}/native-proxy/x/../inspect`]: `${basePath}/native-proxy/inspect`,
          [`${basePath}/native-proxy/inspect?_rsc=abc&a=1`]: `${basePath}/native-proxy/inspect?a=1`,
        })
        expect(goStart).toEqual(tsStart)
        expect(goAdapter).toEqual(tsStart)
      } finally {
        await next.stop()
        await next.deleteFile('proxy.ts')
        await next.patchFile('proxy.go', proxy)
        await next.patchFile('next.config.ts', config)
      }
    })
  }
)

// @force-gate turbopack && !deploy
describe('native-proxy-go requires an App Router application', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const pagesRouterError =
    'proxy.go is only supported in App Router applications'
  const i18nError = 'proxy.go does not support the i18n configuration'

  // Starts the dev server or runs a production build, and returns whether the
  // proxy works and the output of that run.
  async function run() {
    if (isNextDev) {
      // Starting the dev server resets the CLI output.
      await next.start()
      try {
        const response = await next.fetch('/native-proxy/inspect')
        return {
          ok: response.headers.get('x-go-proxy') === 'yes',
          output: next.cliOutput,
        }
      } finally {
        await next.stop()
      }
    }
    const { exitCode, cliOutput } = await next.build()
    return { ok: exitCode === 0, output: cliOutput }
  }

  async function expectError(message: string) {
    if (isNextDev) {
      await next.start()
      try {
        await next.fetch('/native-proxy/inspect')
        await retry(() => {
          expect(next.cliOutput).toContain(message)
        })
      } finally {
        await next.stop()
      }
    } else {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain(message)
    }
  }

  it.each([
    [
      'a Pages Router page',
      'pages/legacy.tsx',
      'export default function Page() { return null }',
    ],
    [
      'only a Pages Router API route',
      'pages/api/legacy.ts',
      'export default function handler(_req: any, res: any) { res.end() }',
    ],
  ])('rejects %s', async (_, file, content) => {
    await next.patchFile(file, content)
    try {
      await expectError(pagesRouterError)
    } finally {
      await next.deleteFile(file)
    }
  })

  it('rejects an i18n configuration', async () => {
    const config = await next.readFile('next.config.ts')
    await next.patchFile(
      'next.config.ts',
      config.replace(
        'experimental: {',
        `i18n: { locales: ['en', 'fr'], defaultLocale: 'en' }, experimental: {`
      )
    )
    try {
      await expectError(i18nError)
    } finally {
      await next.patchFile('next.config.ts', config)
    }
  })

  it('allows a pages directory without routes', async () => {
    // Custom _app, _document and _error files are not routes. A production
    // build of an App Router application cannot include them without pages
    // regardless of proxy.go, so only development checks them.
    const files: Record<string, string> = isNextDev
      ? {
          'pages/_app.tsx': `export default function App({ Component, pageProps }: any) {
            return <Component {...pageProps} />
          }`,
          'pages/_document.tsx': `import { Html, Head, Main, NextScript } from 'next/document'
          export default function Document() {
            return (
              <Html>
                <Head />
                <body>
                  <Main />
                  <NextScript />
                </body>
              </Html>
            )
          }`,
          'pages/_error.tsx': `export default function Error() { return null }`,
        }
      : { 'pages/README.md': 'Not a route.' }
    for (const [file, content] of Object.entries(files)) {
      await next.patchFile(file, content)
    }
    try {
      const { ok, output } = await run()
      expect(output).not.toContain(pagesRouterError)
      expect(ok).toBe(true)
    } finally {
      for (const file of Object.keys(files)) {
        await next.deleteFile(file)
      }
    }
  })
})
// @force-gate turbopack && !deploy
describe('native-proxy-go in src with Go route handlers', () => {
  const { next } = nextTestSetup({ files: join(__dirname, 'src-fixture') })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'forwards %s bodies to Go routes after continuation, overrides and rewrites',
    async (method) => {
      const body = JSON.stringify({ message: 'ordinary request body' })
      for (const path of [
        '/native-proxy/native',
        '/native-proxy/native?override=1',
        '/native-proxy/rewrite',
      ]) {
        const response = await next.fetch(path, { method, body })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ method, body })
        expect((await next.fetch('/native-proxy/native')).status).toBe(200)

        // Explicit client chunking exercises framing even without an override.
        const chunked = await new Promise<{ status: number; body: string }>(
          (resolve, reject) => {
            const req = request(
              next.url + path,
              {
                method,
                headers: { 'transfer-encoding': 'chunked' },
              },
              (res) => {
                const chunks: Buffer[] = []
                res.on('data', (chunk) => chunks.push(chunk))
                res.once('error', reject)
                res.on('end', () =>
                  resolve({
                    status: res.statusCode!,
                    body: Buffer.concat(chunks).toString(),
                  })
                )
              }
            )
            req.once('error', reject)
            req.end(body)
          }
        )
        expect(chunked.status).toBe(200)
        expect(JSON.parse(chunked.body)).toEqual({ method, body })
        expect((await next.fetch('/native-proxy/native')).status).toBe(200)
      }
    }
  )

  it('runs src/proxy.go before a Go handler', async () => {
    // goRoutes alone enables the proxy, with an all-paths matcher by default.
    expect((await next.fetch('/')).headers.get('x-src-proxy')).toBe('yes')
    const response = await next.fetch('/native-proxy/native')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-src-proxy')).toBe('yes')
    expect(await response.text()).toBe('native handler: ')
  })

  it('rewrites to a Go handler with request-header overrides', async () => {
    const response = await next.fetch('/native-proxy/rewrite')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-src-proxy')).toBe('yes')
    expect(await response.text()).toBe('native handler: proxy')
  })
})
