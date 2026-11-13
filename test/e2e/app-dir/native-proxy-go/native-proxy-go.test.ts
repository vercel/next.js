import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { once } from 'events'
import { createServer, request } from 'http'

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

  it.each(['DELETE', 'OPTIONS'])(
    'frames an external rewrite body after %s header overrides',
    async (method) => {
      const requests: Array<{
        url: string
        body: string
        fromGo: string | undefined
      }> = []
      const server = createServer((req, res) => {
        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(chunk))
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString()
          const fromGo = req.headers['x-from-go']
          requests.push({ url: req.url!, body, fromGo })
          if (req.url === '/api/private' && fromGo !== 'overridden') {
            res.statusCode = 403
          }
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ body }))
        })
      })
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      )
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected the external server to listen on a TCP port')
      }

      const payload =
        'GET /api/private HTTP/1.1\r\n' +
        'Host: 127.0.0.1\r\n' +
        'X-From-Go: overridden\r\n\r\n'
      try {
        const direct = await fetch(
          `http://127.0.0.1:${address.port}/api/private`
        )
        expect(direct.status).toBe(403)

        const response = await next.fetch(
          `/native-proxy/external-override?port=${address.port}`,
          { method, body: payload }
        )
        expect(response.status).toBe(200)
        expect(requests).toEqual([
          { url: '/api/private', body: '', fromGo: undefined },
          { url: '/public', body: payload, fromGo: 'overridden' },
        ])
        expect(await response.json()).toEqual({ body: payload })
      } finally {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
      }
    }
  )

  it('preserves repeated cookies', async () => {
    const response = await next.fetch('/native-proxy/cookies')
    expect(response.headers.get('set-cookie')).toContain('first=one')
    expect(response.headers.get('set-cookie')).toContain('second=two')
  })

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
      // Like Node.js proxies, Go proxies register no Edge functions.
      const middlewareManifest = JSON.parse(
        await next.readFile('.next/server/middleware/middleware-manifest.json')
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
      try {
        await retry(async () => {
          const response = await fetch(
            `http://127.0.0.1:${port}/native-proxy/inspect`
          )
          expect(response.headers.get('x-middleware-next')).toBe('1')
        })
        const rewrite = await fetch(
          `http://127.0.0.1:${port}/native-proxy/rewrite`
        )
        expect(rewrite.headers.get('x-middleware-rewrite')).toBe(
          `http://127.0.0.1:${port}/api/proxy-query?rewritten=1`
        )
        const body = await fetch(`http://127.0.0.1:${port}/native-proxy/body`, {
          method: 'POST',
          body: 'hosted body',
        })
        expect(body.headers.get('x-go-body')).toBe('hosted body')
        for (const [parameter, header] of [
          ['relative-location', 'location'],
          ['relative-rewrite', 'x-middleware-rewrite'],
        ]) {
          for (const destination of ['?new=1', './target?new=1', '#section']) {
            const url = new URL(`http://127.0.0.1:${port}/native-proxy/a%2Fb`)
            url.search = new URLSearchParams({
              old: '1',
              [parameter]: destination,
            }).toString()
            const response = await fetch(url, { redirect: 'manual' })
            expect(response.headers.get(header)).toBe(
              new URL(destination, url).href
            )
          }
        }
      } finally {
        const exited = once(child, 'exit')
        child.kill()
        await exited
        await fs.rm(directory, { recursive: true, force: true })
      }
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
  }
)

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
