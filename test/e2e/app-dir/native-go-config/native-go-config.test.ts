import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { fetchViaRawHttp, findPort, retry } from 'next-test-utils'
import { spawn, type ChildProcess } from 'child_process'
import { once } from 'events'
import { chmod, copyFile, mkdtemp, rm } from 'fs/promises'
import { createServer, request } from 'http'
import { tmpdir } from 'os'
import { createConnection } from 'net'
import type { AdapterOutput } from 'next'
import { NodeNextRequest } from 'next/dist/server/base-http/node'
import { distinctHeaders } from 'next/dist/server/lib/native-headers'
import { getMiddlewareRouteMatcher } from 'next/dist/shared/lib/router/utils/middleware-route-matcher'

// Hosted Go support requires the companion adapter/builder releases.
// @force-gate turbopack && !deploy
describe('static Go config', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  beforeAll(async () => {
    await next.start()
  })

  it('applies proxy matchers while serving a Go route', async () => {
    const response = await next.fetch('/configured')
    expect(await response.text()).toBe('configured route')
    expect(response.headers.get('x-static-go-config')).toBe('matched')
    expect((await next.fetch('/')).headers.get('x-static-go-config')).toBeNull()
  })

  it('applies has and missing conditions', async () => {
    expect(
      (await next.fetch('/conditional')).headers.get('x-static-go-config')
    ).toBeNull()
    expect(
      (
        await next.fetch('/conditional', {
          headers: { 'x-config-match': 'yes' },
        })
      ).headers.get('x-static-go-config')
    ).toBe('matched')
    expect(
      (await next.fetch('/missing')).headers.get('x-static-go-config')
    ).toBe('matched')
    expect(
      (
        await next.fetch('/missing', { headers: { cookie: 'skip=yes' } })
      ).headers.get('x-static-go-config')
    ).toBeNull()
  })

  it('keeps header conditions aligned with repeated Go request fields', async () => {
    const protectedResponse = await fetchViaRawHttp(next.url, '/headers/has', {
      headers: { 'x-resource': 'private' },
    })
    expect(protectedResponse.status).toBe(403)
    for (const headers of [
      { 'x-resource': ['private', 'public'] },
      { 'x-resource': ['public', 'private'] },
      { 'X-Resource': ['private', 'public', 'other'] },
      { 'set-cookie': ['private', 'public'] },
    ]) {
      const response = await fetchViaRawHttp(next.url, '/headers/has', {
        headers,
      })
      expect(response.status).toBe(400)
      expect(await response.text()).not.toContain('secret')
    }
    for (const value of ['public', 'private, public']) {
      const response = await fetchViaRawHttp(next.url, '/headers/has', {
        headers: { 'x-resource': value },
      })
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('public')
    }
  })

  it('keeps header conditions aligned with Connection-nominated Go request fields', async () => {
    expect((await next.fetch('/headers/missing')).status).toBe(403)
    for (const headers of [
      { connection: 'x-resource', 'x-resource': 'public' },
      { connection: 'keep-alive, X-Resource', 'x-resource': 'public' },
    ]) {
      const response = await fetchViaRawHttp(next.url, '/headers/missing', {
        headers,
      })
      expect(response.status).toBe(400)
      expect(await response.text()).not.toContain('secret')
    }
    const response = await fetchViaRawHttp(next.url, '/headers/missing', {
      headers: { 'x-resource': 'public' },
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('public')
  })

  it('rejects ambiguous header conditions before JavaScript routes', async () => {
    for (const headers of [
      { connection: 'x-resource', 'x-resource': 'private' },
      { connection: 'keep-alive, X-Resource', 'x-resource': 'private' },
      { connection: 'cookie', cookie: 'resource=private' },
      { 'x-resource': ['private', 'public'] },
      { 'x-resource': ['public', 'private'] },
    ]) {
      const response = await fetchViaRawHttp(next.url, '/headers/javascript', {
        headers,
      })
      expect(response.status).toBe(400)
      expect(await response.text()).not.toContain('secret')
    }
    for (const headers of [
      { 'x-resource': 'private' },
      { cookie: 'resource=private' },
    ]) {
      const response = await fetchViaRawHttp(next.url, '/headers/javascript', {
        headers,
      })
      expect(response.status).toBe(403)
    }
    expect(await (await next.fetch('/headers/javascript')).text()).toBe(
      'public'
    )
  })

  if (isNextDev) {
    it.each([
      {
        failure: 'static Go Config analysis',
        from: 'Source: "/configured"',
        to: 'Source: configSource()',
        extra: '\nfunc configSource() string { return "/configured" }\n',
        error: 'static string literals',
      },
      {
        failure: 'Go compilation',
        from: 'proxy.Next(w)',
        to: 'proxy.Next(w, undefinedOption)',
        extra: '',
        error: 'undefined: undefinedOption',
      },
      {
        failure: 'expanded matcher validation',
        from: 'Source: "/configured"',
        // The literal is valid, but the expanded matcher exceeds 4096 characters.
        to: `Source: "${'/' + 'a'.repeat(4089)}"`,
        extra: '',
        error: 'exceeds max built length of 4096',
      },
    ])(
      'fails closed on initial $failure and restrictive → invalid → valid edits',
      async ({ from, to, extra, error }) => {
        await next.stop()
        await next.clean()
        const source = await next.readFile('proxy.go')
        const invalidSource = source.replace(from, to) + extra
        const expectBlocked = async () => {
          await retry(async () => {
            // Both paths are outside the restrictive matcher used below. Native
            // routes must not bypass the failed proxy via their fast path.
            for (const path of ['/configured', '/']) {
              const response = await next.fetch(path)
              expect(response.status).toBe(500)
              expect(await response.text()).not.toBe('configured route')
            }
          }, 60_000)
          expect(next.cliOutput).toContain(error)
        }
        try {
          // No descriptor exists when the first proxy compile fails.
          await next.patchFile('proxy.go', invalidSource)
          await next.start()
          await expectBlocked()

          await next.patchFile(
            'proxy.go',
            source.replace('Source: "/configured"', 'Source: "/not-configured"')
          )
          await retry(async () => {
            const response = await next.fetch('/configured')
            expect(response.status).toBe(200)
            expect(await response.text()).toBe('configured route')
            expect(response.headers.get('x-static-go-config')).toBeNull()
          }, 60_000)

          // A previous descriptor now exists, but it must not keep its matchers
          // when a new compile fails before publishing a replacement.
          await next.patchFile('proxy.go', invalidSource)
          await expectBlocked()
        } finally {
          await next.patchFile('proxy.go', source)
        }
        await retry(async () => {
          const response = await next.fetch('/configured')
          expect(response.status).toBe(200)
          expect(await response.text()).toBe('configured route')
          expect(response.headers.get('x-static-go-config')).toBe('matched')
          expect(
            (await next.fetch('/')).headers.get('x-static-go-config')
          ).toBeNull()
        }, 60_000)
      },
      360_000
    )

    it('updates the proxy matcher after a literal edit', async () => {
      const source = await next.readFile('proxy.go')
      try {
        await next.patchFile(
          'proxy.go',
          source.replace('Source: "/configured"', 'Source: "/"')
        )
        await retry(async () => {
          expect(
            (await next.fetch('/')).headers.get('x-static-go-config')
          ).toBe('matched')
          expect(
            (await next.fetch('/configured')).headers.get('x-static-go-config')
          ).toBeNull()
        }, 60_000)
      } finally {
        await next.patchFile('proxy.go', source)
      }
    }, 180_000)

    it('fails requests instead of skipping the proxy while its Config is invalid', async () => {
      // Go accepts the literal; Next.js matcher validation rejects it, which
      // `next build` reports as an error. Dev must not serve the routes the
      // proxy guards without running it.
      const source = await next.readFile('proxy.go')
      try {
        await next.patchFile(
          'proxy.go',
          source.replace('Source: "/configured"', 'Source: "invalid"')
        )
        await retry(async () => {
          const response = await next.fetch('/configured')
          expect(response.status).toBe(500)
          expect(await response.text()).not.toBe('configured route')
        }, 60_000)
        expect(next.cliOutput).toContain('must start with /')
      } finally {
        await next.patchFile('proxy.go', source)
      }
      await retry(async () => {
        const response = await next.fetch('/configured')
        expect(await response.text()).toBe('configured route')
        expect(response.headers.get('x-static-go-config')).toBe('matched')
      }, 60_000)
    }, 240_000)
  }

  if (isNextStart) {
    it('emits route duration and proxy matchers into manifests and adapter output', async () => {
      const manifest = await next.readJSON(
        '.next/server/functions-config-manifest.json'
      )
      expect(manifest.functions['/configured']).toEqual({ maxDuration: 17 })
      // Like proxy.ts, a Go proxy only configures matchers.
      expect(manifest.functions['/_middleware']).not.toHaveProperty(
        'maxDuration'
      )
      expect(manifest.functions['/_middleware']).not.toHaveProperty('regions')
      expect(manifest.functions['/_middleware']).toMatchObject({
        matchers: [
          expect.objectContaining({ originalSource: '/configured' }),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
        ],
      })
      await next.stop()
      const config = await next.readFile('next.config.ts')
      await next.patchFile(
        'next.config.ts',
        config.replace(
          'experimental:',
          `adapterPath: ${JSON.stringify(join(next.testDir, 'capture-adapter.mjs'))}, experimental:`
        )
      )
      try {
        await next.build()
        const output = await next.readJSON('go-config-output.json')
        expect(output.middleware).toMatchObject({
          runtime: 'go',
          config: {
            matchers: [
              expect.objectContaining({ source: '/configured' }),
              expect.anything(),
              expect.anything(),
              expect.anything(),
              expect.anything(),
              expect.anything(),
              expect.anything(),
              expect.anything(),
            ],
          },
        })
        expect(
          output.routes.find(
            (route: { pathname: string }) => route.pathname === '/configured'
          )
        ).toMatchObject({
          runtime: 'go',
          config: { maxDuration: 17 },
        })
      } finally {
        await next.patchFile('next.config.ts', config)
      }
    })

    it('supports adapter conditions and validates Go routes even when the platform skips the proxy', async () => {
      await next.stop()
      const config = await next.readFile('next.config.ts')
      const children: ChildProcess[] = []
      const directory = await mkdtemp(join(tmpdir(), 'go-condition-adapter-'))
      const server = createServer()
      try {
        await next.patchFile(
          'next.config.ts',
          config.replace(
            'experimental:',
            `adapterPath: ${JSON.stringify(join(next.testDir, 'capture-adapter.mjs'))}, experimental:`
          )
        )
        const result = await next.build()
        expect(result.exitCode).toBe(0)
        const output: {
          middleware: AdapterOutput['MIDDLEWARE']
          routes: AdapterOutput['APP_ROUTE'][]
        } = await next.readJSON('go-config-output.json')
        const matchers = output.middleware.config.matchers!
        for (const [kind, type] of [
          ['has', 'header'],
          ['missing', 'header'],
          ['has', 'cookie'],
          ['missing', 'cookie'],
        ] as const) {
          expect(matchers).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                [kind]: expect.arrayContaining([
                  expect.objectContaining({ type }),
                ]),
              }),
            ])
          )
        }
        const match = getMiddlewareRouteMatcher(
          matchers.map((matcher) => ({
            ...matcher,
            regexp: matcher.sourceRegex,
            originalSource: matcher.source,
          }))
        )
        const origins = new Map<string, string>()
        const paths = ['/_middleware', '/headers/has', '/headers/missing']
        for (const [index, pathname] of paths.entries()) {
          const entry =
            pathname === '/_middleware'
              ? output.middleware
              : output.routes.find((route) => route.pathname === pathname)!
          expect(entry.runtime).toBe('go')
          const binary = join(
            directory,
            `${index}${process.platform === 'win32' ? '.exe' : ''}`
          )
          await copyFile(entry.filePath, binary)
          await chmod(binary, 0o755)
          const port = await findPort()
          children.push(
            spawn(binary, [], {
              cwd: directory,
              env: { ...process.env, PORT: String(port) },
              stdio: 'inherit',
            })
          )
          const origin = `http://127.0.0.1:${port}`
          origins.set(pathname, origin)
          await retry(async () => {
            await fetchViaRawHttp(origin, '/unmatched-readiness')
          })
        }
        // Released deployment builders cannot host Go middleware yet. Dispatch
        // the real adapter executables using the ordinary JavaScript matcher,
        // without Next's Node-only Go header guard. Preserve repeated headers
        // when forwarding, including when the platform skips the proxy.
        let proxyCalls = 0
        server.on('request', (req, res) => {
          try {
            const pathname = new URL(req.url!, 'http://localhost').pathname
            const matched = match(pathname, new NodeNextRequest(req), {})
            if (matched) proxyCalls++
            const target = origins.get(matched ? '/_middleware' : pathname)
            if (!target) {
              res.end('skipped')
              return
            }
            const upstream = request(
              new URL(req.url!, target),
              {
                method: req.method,
                headers: { ...distinctHeaders(req), host: req.headers.host },
              },
              (response) => {
                res.writeHead(response.statusCode!, response.headers)
                response.pipe(res)
              }
            )
            upstream.on('error', (error) => res.destroy(error))
            req.pipe(upstream)
          } catch (error) {
            console.error(error)
            res.statusCode = 500
            res.end('Adapter request failed')
          }
        })
        const port = await findPort()
        await new Promise<void>((resolve) =>
          server.listen(port, '127.0.0.1', resolve)
        )
        const origin = `http://127.0.0.1:${port}`
        for (const [pathname, headers, matched] of [
          ['/conditional', { 'x-config-match': 'yes' }, true],
          ['/conditional', { 'x-config-match': 'no' }, false],
          ['/missing', {}, true],
          ['/missing', { cookie: 'skip=yes' }, false],
          ['/headers/javascript', { cookie: 'resource=private' }, true],
          ['/headers/javascript', { cookie: 'resource=public' }, false],
          ['/headers/missing', {}, true],
          ['/headers/missing', { 'x-resource': 'public' }, false],
        ] as const) {
          const response = await fetchViaRawHttp(origin, pathname, { headers })
          expect(
            response.status === 403 ||
              response.headers.get('x-static-go-config') === 'matched'
          ).toBe(matched)
        }
        for (const headers of [
          { 'x-resource': ['private', 'public'] },
          { 'x-resource': ['public', 'private'] },
          { 'set-cookie': ['private', 'public'] },
          { connection: 'x-resource', 'x-resource': 'public' },
          { connection: 'cookie', cookie: 'skip=yes' },
        ]) {
          const before = proxyCalls
          const response = await fetchViaRawHttp(origin, '/headers/has', {
            headers,
          })
          expect(response.status).toBe(400)
          expect(await response.text()).not.toContain('secret')
          expect(proxyCalls).toBe(before)
        }
        // An array-valued Cookie option is already joined by Node's client.
        // Use raw field lines to exercise the Go entrypoint's normalization.
        const repeatedCookies = await new Promise<string>((resolve, reject) => {
          let response = ''
          const socket = createConnection(
            {
              host: '127.0.0.1',
              port: Number(new URL(origins.get('/_middleware')!).port),
            },
            () => {
              socket.write(
                'GET /conditional HTTP/1.1\r\nHost: localhost\r\nx-config-match: yes\r\nCookie: session=one\r\nCookie: skip=yes\r\nConnection: close\r\n\r\n'
              )
            }
          )
          socket.on('error', reject)
          socket.on('data', (chunk) => {
            response += chunk.toString()
          })
          socket.on('end', () => resolve(response))
        })
        expect(repeatedCookies).toMatch(/^HTTP\/1\.1 200 /)
        expect(repeatedCookies.toLowerCase()).toContain(
          '\r\nx-request-cookie: session=one; skip=yes\r\n'
        )
        const unrelated = await fetchViaRawHttp(origin, '/headers/has', {
          headers: { 'x-unrelated': ['one', 'two'] },
        })
        expect(unrelated.status).toBe(200)
        expect(unrelated.headers.get('x-unrelated-values')).toBe('one|two')
      } finally {
        if (server.listening) {
          server.closeAllConnections()
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()))
          })
        }
        for (const child of children) {
          if (child.exitCode === null) {
            const exited = once(child, 'exit')
            child.kill()
            await exited
          }
        }
        await rm(directory, { recursive: true, force: true })
        await next.patchFile('next.config.ts', config)
      }
    }, 360_000)
  }
})

// These assertions intentionally fail builds before any app can be deployed.
// @force-gate turbopack && start
describe('static Go config diagnostics', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })
  const cases = [
    {
      file: 'proxy.go',
      from: 'var Config = proxy.Config{',
      to: 'var Config = proxy.Config{MaxDuration: 11,',
      error: 'unsupported Config field MaxDuration',
    },
    {
      file: 'proxy.go',
      from: 'Source: "/configured"',
      to: 'Source: os.Getenv("PROXY_PATH")',
      error: 'static string literals',
    },
    {
      file: 'app/configured/route.go',
      from: 'const MaxDuration = 17',
      to: 'const MaxDuration = 10 + 7',
      error: 'positive integer literal',
    },
    {
      file: 'app/configured/route.go',
      from: 'const MaxDuration = 17',
      to: 'var MaxDuration = duration()',
      error: 'positive integer literal',
    },
    {
      file: 'app/configured/route.go',
      from: 'const MaxDuration = 17',
      to: 'const MaxDuration time.Duration = 17',
      error: 'number of seconds',
    },
    {
      file: 'proxy.go',
      from: 'Source: "/configured"',
      to: 'Source: "invalid"',
      error: 'must start with /',
    },
  ]
  for (const { file, from, to, error } of cases) {
    it(`rejects ${file}: ${to}`, async () => {
      const source = await next.readFile(file)
      try {
        let patched = source.replace(from, to)
        expect(patched).not.toBe(source)
        if (to.includes('os.Getenv'))
          patched = patched.replace('"net/http"', '"net/http"\n"os"')
        if (to.includes('duration()'))
          patched += '\nfunc duration() int { return 17 }\n'
        if (to.includes('time.Duration'))
          patched = patched.replace(
            'import "net/http"',
            'import (\n"net/http"\n"time"\n)'
          )
        await next.patchFile(file, patched)
        const result = await next.build()
        expect(result.exitCode).not.toBe(0)
        expect(result.cliOutput).toContain(error)
        expect(result.cliOutput).toContain(file)
      } finally {
        await next.patchFile(file, source)
      }
    })
  }
})
