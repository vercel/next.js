import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { once } from 'events'

// Hosted tests require the Go proxy adapter and builder releases (see README.md).
// @force-gate turbopack && !deploy
describe('native-proxy-go', () => {
  const { next, isNextStart } = nextTestSetup({ files: __dirname })

  it('continues to a JS handler and matches all paths', async () => {
    const response = await next.fetch('/native-proxy/inspect')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-go-proxy')).toBe('yes')
    expect((await next.fetch('/')).headers.get('x-go-proxy')).toBe('yes')
  })

  it('returns a terminal response', async () => {
    const response = await next.fetch('/native-proxy/blocked')
    expect(response.status).toBe(403)
    expect(await response.text()).toBe('blocked by Go\n')
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

  it('preserves repeated cookies', async () => {
    const response = await next.fetch('/native-proxy/cookies')
    expect(response.headers.get('set-cookie')).toContain('first=one')
    expect(response.headers.get('set-cookie')).toContain('second=two')
  })

  it('replays a body consumed by Go to the rewritten handler', async () => {
    const response = await next.fetch('/native-proxy/body', {
      method: 'POST',
      body: 'hello from POST',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-go-body')).toBe('hello from POST')
    expect(await response.json()).toMatchObject({
      method: 'POST',
      body: 'hello from POST',
    })
  })

  it('preserves streaming terminal responses', async () => {
    const response = await next.fetch('/native-proxy/stream')
    expect(response.status).toBe(201)
    expect(await response.text()).toBe('first\n' + 'go'.repeat(1000))
  })

  it('does not expose private worker authentication metadata', async () => {
    const response = await next.fetch('/native-proxy/inspect', {
      headers: { 'x-next-internal-go-token': 'forged' },
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
      } finally {
        const exited = once(child, 'exit')
        child.kill()
        await exited
        await fs.rm(directory, { recursive: true, force: true })
      }
    })
  }
})

// Inspecting the build ID and patching config before startup require a local build.
// @force-gate turbopack && start
describe('native-proxy-go with skipProxyUrlNormalize', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  beforeAll(async () => {
    const config = await next.readFile('next.config.ts')
    await next.patchFile(
      'next.config.ts',
      config.replace(
        'experimental: {',
        'skipProxyUrlNormalize: true, experimental: {'
      )
    )
    await next.start()
  })

  it('preserves the original data-request URL', async () => {
    const path = `/_next/data/${next.buildId}/native-proxy/inspect.json?from=data`
    const response = await next.fetch(path)
    expect(response.headers.get('x-go-url')).toBe(path)
  })
})

// @force-gate turbopack && !deploy
describe('native-proxy-go in src with Go route handlers', () => {
  const { next } = nextTestSetup({ files: join(__dirname, 'src-fixture') })

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
