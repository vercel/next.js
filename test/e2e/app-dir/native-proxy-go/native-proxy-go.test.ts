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
  callback: (origin: string, buildId: string) => Promise<void>
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
  const buildId = (await next.readFile('.next/BUILD_ID')).trim()
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
    await callback(origin, buildId)
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

  it.each([
    '/native-proxy/secure',
    '/native-proxy/secure.rsc',
    '/native-proxy/secure.segments/_tree.segment.rsc',
    '/native-proxy/pages-secure',
  ])('protects the secure page through %s', async (path) => {
    const response = await next.fetch(path)
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('protected\n')
  })

  // The build ID and Pages data endpoint require a local production build.
  // @force-gate start
  it('protects the secure Pages data endpoint', async () => {
    const response = await next.fetch(
      `/_next/data/${next.buildId}/native-proxy/pages-secure.json`
    )
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('protected\n')
  })

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
    expect(await response.json()).toMatchObject({ query: { rewritten: '1' } })
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

  // @force-gate start
  it('normalizes data-request URLs by default', async () => {
    const response = await next.fetch(
      `/_next/data/${next.buildId}/native-proxy/inspect.json?from=data`
    )
    expect(response.headers.get('x-go-url')).toBe(
      '/native-proxy/inspect?from=data'
    )
  })

  // Artifact inspection and executing a build-host binary are self-hosted checks.
  if (isNextStart) {
    it('emits a Go middleware output whose PORT server runs without Next.js', async () => {
      await withAdapterProxy(next, async (origin, buildId) => {
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
        // Platforms invoke the executable with original request URLs, so
        // every transport form of a page must be authorized as that page.
        for (const path of [
          '/native-proxy/secure',
          '/native-proxy/secure.rsc',
          '/native-proxy/secure.segments/_tree.segment.rsc',
          '/native-proxy/pages-secure',
          `/_next/data/${buildId}/native-proxy/pages-secure.json`,
          `/_next/data/${buildId}/native-proxy/pages-secure`,
          '/_next/data/other-build/native-proxy/pages-secure.json',
          `/%5Fnext/data/${buildId}/native-proxy/pages-secure%2Ejson`,
        ]) {
          const response = await fetch(`${origin}${path}`)
          expect({ path, status: response.status }).toEqual({
            path,
            status: 403,
          })
          expect(response.headers.get('x-middleware-next')).toBeNull()
        }
        // Each transport URL reaches Proxy as the page URL it resolves to.
        // Other URLs, including encoded separators, are forwarded unchanged.
        for (const [path, expected] of [
          [
            `/_next/data/${buildId}/native-proxy/inspect.json?from=data&x=1`,
            '/native-proxy/inspect?from=data&x=1',
          ],
          [`/_next/data/${buildId}/index.json`, '/'],
          [`/_next/data/${buildId}/index/index.json`, '/index'],
          [`/_next/data/${buildId}/index/index/foo.json`, '/index/foo'],
          // /index/<segment> is emitted unchanged for dynamic routes.
          [`/_next/data/${buildId}/index/settings.json`, '/index/settings'],
          [
            `/_next/data/${buildId}%2Fextra/native-proxy/inspect.json`,
            '/native-proxy/inspect',
          ],
          ['/_next/data//native-proxy/inspect.json', '/native-proxy/inspect'],
          [
            `/_next/data/${buildId}/native-proxy/a%2Fb.json`,
            '/native-proxy/a%2Fb',
          ],
          ['/native-proxy/inspect%2Ersc', '/native-proxy/inspect'],
          [
            '/native-proxy/inspect.segments/$c$children/__PAGE__.segment.rsc',
            '/native-proxy/inspect',
          ],
          [
            '/native-proxy/inspect.segments/$c$children/$d$slug/__PAGE__.segment.rsc',
            '/native-proxy/inspect',
          ],
          ['/_next/static/chunks/main.js', '/_next/static/chunks/main.js'],
          ['/_next/data', '/_next/data'],
          ['/native-proxy/inspect.json', '/native-proxy/inspect.json'],
          ['/native-proxy/a%2Fb', '/native-proxy/a%2Fb'],
        ]) {
          // Send the raw path, without client-side URL normalization.
          const response = await fetchViaRawHttp(origin, path)
          expect({ path, url: response.headers.get('x-go-url') }).toEqual({
            path,
            url: expected,
          })
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
describe.each([false, true])(
  'native-proxy-go with i18n and skipProxyUrlNormalize: %s',
  (skipProxyUrlNormalize) => {
    const { next } = nextTestSetup({ files: __dirname, skipStart: true })

    beforeAll(async () => {
      const config = await next.readFile('next.config.ts')
      await next.patchFile(
        'next.config.ts',
        config.replace(
          'experimental: {',
          `skipProxyUrlNormalize: ${skipProxyUrlNormalize},
        i18n: { locales: ['en', 'fr'], defaultLocale: 'en' },
        experimental: {`
        )
      )
      await next.start()
    })

    it.each(['', '/en', '/fr'])(
      'forwards the URL with locale prefix "%s"',
      async (prefix) => {
        const path = `${prefix}/url-normalization?from=locale`
        const response = await next.fetch(path)
        expect(response.status).toBe(200)
        expect(response.headers.get('x-go-url')).toBe(
          !skipProxyUrlNormalize && prefix === '/en'
            ? '/url-normalization?from=locale'
            : path
        )
      }
    )

    // The build ID and Pages data endpoint require a local production build.
    // @force-gate start
    it('handles the original locale-prefixed data-request URL', async () => {
      const path = `/_next/data/${next.buildId}/en/url-normalization.json?from=data`
      const response = await next.fetch(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('x-go-url')).toBe(
        skipProxyUrlNormalize ? path : '/url-normalization?from=data'
      )
    })

    // Executing a build-host binary is a self-hosted check.
    // @force-gate start
    it('normalizes locale-prefixed data-request URLs in adapter builds', async () => {
      await withAdapterProxy(next, async (origin, buildId) => {
        for (const [locale, expected] of [
          ['en', '/url-normalization?from=data'],
          ['fr', '/fr/url-normalization?from=data'],
        ]) {
          const path = `/_next/data/${buildId}/${locale}/url-normalization.json?from=data`
          const response = await fetch(`${origin}${path}`)
          expect(response.headers.get('x-go-url')).toBe(
            skipProxyUrlNormalize ? path : expected
          )
        }
        const data = await fetch(
          `${origin}/_next/data/${buildId}/en/native-proxy/pages-secure.json`
        )
        expect(data.status).toBe(skipProxyUrlNormalize ? 200 : 403)
      })
    })
  }
)

// Hosted tests require the Go proxy adapter and builder releases.
// @force-gate turbopack && !deploy
describe('native-proxy-go adapter build with basePath and i18n domains', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  // Executing a build-host binary is a self-hosted check.
  // @force-gate start
  it('normalizes transport URLs with basePath and domain default locales', async () => {
    const config = await next.readFile('next.config.ts')
    await next.patchFile(
      'next.config.ts',
      config.replace(
        'experimental: {',
        `basePath: '/docs',
        i18n: {
          locales: ['en', 'fr', 'nl'],
          defaultLocale: 'en',
          domains: [{ domain: 'fr.example.test', defaultLocale: 'fr' }],
        },
        experimental: {`
      )
    )
    await withAdapterProxy(next, async (origin, buildId) => {
      const data = `/docs/_next/data/${buildId}`
      for (const [host, path, expected] of [
        [
          undefined,
          `${data}/en/url-normalization.json`,
          '/docs/url-normalization',
        ],
        [
          undefined,
          `${data}/EN/url-normalization.json`,
          '/docs/url-normalization',
        ],
        [
          undefined,
          `${data}/fr/url-normalization.json`,
          '/docs/fr/url-normalization',
        ],
        [undefined, `${data}/en.json`, '/docs'],
        [undefined, `${data}/nl.json`, '/docs/nl'],
        [
          undefined,
          '/docs/native-proxy/inspect.rsc',
          '/docs/native-proxy/inspect',
        ],
        [
          undefined,
          '/docs/native-proxy/inspect.segments/_tree.segment.rsc',
          '/docs/native-proxy/inspect',
        ],
        // Paths outside basePath are not data requests for this application.
        [
          undefined,
          `/docsx/_next/data/${buildId}/en/url-normalization.json`,
          `/docsx/_next/data/${buildId}/en/url-normalization.json`,
        ],
        [
          'fr.example.test',
          `${data}/fr/url-normalization.json`,
          '/docs/url-normalization',
        ],
        [
          'FR.example.test:3000',
          `${data}/fr/url-normalization.json`,
          '/docs/url-normalization',
        ],
        [
          'fr.example.test',
          `${data}/en/url-normalization.json`,
          '/docs/en/url-normalization',
        ],
      ]) {
        const response = await fetchViaRawHttp(origin, path!, {
          headers: host ? { host } : {},
        })
        expect({ host, path, url: response.headers.get('x-go-url') }).toEqual({
          host,
          path,
          url: expected,
        })
      }
    })
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
