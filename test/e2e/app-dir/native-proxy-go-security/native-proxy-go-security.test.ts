import { nextTestSetup } from 'e2e-utils'
import { fetchViaRawHttp, findPort, retry } from 'next-test-utils'
import { spawn, type ChildProcess } from 'child_process'
import { once } from 'events'
import { chmod, copyFile, mkdtemp, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const queryAttacks = [
  'resource=public.rsc',
  'resource=public.rsc?extra',
  'resource=private&nxtPresource=public',
  'resource=private&nxtIresource=public',
  'nxtPresource=public',
  'nxtIresource=public',
]

async function expectQueryAuthorization(
  fetchRequest: (path: string) => Promise<Response>
) {
  for (const query of queryAttacks) {
    const response = await fetchRequest(`/native-security/query?${query}`)
    expect({ query, status: response.status }).toEqual({ query, status: 403 })
    expect(await response.text()).not.toContain('"secret":true')
  }
  const response = await fetchRequest(
    '/native-security/query?resource=public&nxtPresource=private&nxtIresource=private'
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    resource: 'public',
    secret: false,
  })
}

// App Router strips an RSC suffix from decoded route params, so proxy.go
// rejects paths that still carry one after the transport suffix is removed.
async function expectRejected(response: Response, path: string) {
  expect({ path, status: response.status }).toEqual({ path, status: 404 })
  expect(await response.text()).not.toContain('"secret":true')
}

async function expectRSCSuffixedParams(
  fetchRequest: (path: string) => Promise<Response>
) {
  for (const path of [
    '/native-security/resource/private%2Ersc',
    '/native-security/resource/parent/private%2Ersc',
    '/native-security/resource/private%2ersc',
    '/native-security/single/private%2Ersc',
  ]) {
    await expectRejected(await fetchRequest(path), path)
  }
  expect((await fetchRequest('/native-security/resource/private')).status).toBe(
    403
  )
  for (const kind of ['resource', 'single']) {
    for (const suffix of ['literal%2Ersc', 'literal.rsc.rsc']) {
      const path = `/native-security/${kind}/${suffix}`
      await expectRejected(await fetchRequest(path), path)
    }
  }
}

async function expectEdgeParamAuthorization(
  fetchRequest: (path: string) => Promise<Response>
) {
  for (const query of [
    'name=private&nxtPname=public',
    'name=private&nxtIname=public',
    'nxtPname=public',
  ]) {
    const response = await fetchRequest(`/native-security/edge/public?${query}`)
    expect({ query, status: response.status }).toEqual({ query, status: 200 })
    expect(await response.json()).toEqual({ name: 'public', secret: false })
  }

  for (const path of [
    '/native-security/edge/private',
    '/native-security/edge/private.rsc',
  ]) {
    const response = await fetchRequest(path)
    expect({ path, status: response.status }).toEqual({ path, status: 403 })
    expect(await response.text()).not.toContain('"secret":true')
  }

  for (const path of [
    '/native-security/edge/private%2Ersc',
    '/native-security/edge/literal%2Ersc',
    '/native-security/edge/literal.rsc.rsc',
  ]) {
    await expectRejected(await fetchRequest(path), path)
  }
}

// Setup compiles proxy.go with a cold Go build of the standard library. The
// flake job runs this suite three times concurrently with an empty Go build
// cache, where that build alone has taken 117s, nearly the default 120s hook
// timeout. Builds and startup also run in the same hook.
const coldGoBuildTimeout = 240_000

// Go middleware requires Turbopack, and released hosting builders do not yet
// support its artifact. Deployment-specific coverage below invokes that artifact.
// Edge Runtime is not supported with Cache Components.
// @force-gate turbopack && !deploy && !cacheComponents
describe('native proxy authorization', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  beforeAll(async () => {
    await next.start()
  }, coldGoBuildTimeout)

  it('authorizes the same query values as the App Router handler', async () => {
    await expectQueryAuthorization((path) => next.fetch(path))
  })

  it('rejects RSC suffixes that route params would strip again', async () => {
    await expectRSCSuffixedParams((path) => next.fetch(path))
  })

  it('keeps Edge route params aligned with the authorized pathname', async () => {
    await expectEdgeParamAuthorization((path) => next.fetch(path))
  })

  it('preserves repeated ordinary query parameters', async () => {
    const query = new URLSearchParams({ resource: 'public' })
    for (let i = 0; i < 2000; i++) query.append('value', 'a')
    const response = await next.fetch(`/native-security/query?${query}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      repeated: 2000,
      secret: false,
    })
  })
})

type CapturedOutputs = {
  middleware: { filePath: string }
  appRoutes: Array<{
    pathname: string
    runtime: string
    filePath: string
  }>
  prerenders: Array<{
    pathname: string
    fallback?: { filePath?: string }
  }>
  staticFiles: Array<{ pathname: string; filePath: string }>
}

// Released builders cannot deploy Go middleware yet. Build its real adapter
// output, run its PORT executable, and dispatch Next responses to emitted
// App Router handlers or the emitted prerender files, as a platform does.
// These are attacker HTTP requests to published artifact paths, rather than
// synthetic client-router prefetches with invented internal headers.
// Edge Runtime is not supported with Cache Components.
// @force-gate turbopack && start && !cacheComponents
describe('adapter Go proxy authorization', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    startCommand: 'node adapter-server.mjs',
    serverReadyPattern: /Adapter server ready/,
  })
  let child: ChildProcess | undefined
  let goRouteChild: ChildProcess | undefined
  let binaryDirectory: string | undefined
  let origin: string
  let goRouteOrigin: string
  let outputs: CapturedOutputs

  beforeAll(async () => {
    if (!isNextStart) return
    const config = await next.readFile('next.config.ts')
    await next.patchFile(
      'next.config.ts',
      config.replace(
        'experimental: {',
        `basePath: "/docs", adapterPath: ${JSON.stringify(join(next.testDir, 'capture-adapter.mjs'))}, experimental: {`
      )
    )
    const build = await next.build()
    if (build.exitCode !== 0) {
      throw new Error('Adapter security fixture failed to build')
    }
    outputs = JSON.parse(await next.readFile('security-outputs.json'))
    await next.start({ skipBuild: true })
    const port = await findPort()
    binaryDirectory = await mkdtemp(join(tmpdir(), 'go-proxy-security-'))
    const binary = join(
      binaryDirectory,
      process.platform === 'win32' ? 'proxy.exe' : 'proxy'
    )
    await copyFile(outputs.middleware.filePath, binary)
    await chmod(binary, 0o755)
    child = spawn(binary, [], {
      cwd: binaryDirectory,
      env: { ...process.env, PORT: String(port) },
      stdio: 'inherit',
    })
    origin = `http://127.0.0.1:${port}`
    await retry(async () => {
      expect(
        (await fetch(`${origin}/docs/`)).headers.get('x-middleware-next')
      ).toBe('1')
    })

    const goRoute = outputs.appRoutes.find(
      (output) => output.pathname === '/docs/native-security/go/[...name]'
    )
    if (!goRoute || goRoute.runtime !== 'go') {
      throw new Error('Missing adapter-built Go route')
    }
    const goRouteBinary = join(
      binaryDirectory,
      process.platform === 'win32' ? 'route.exe' : 'route'
    )
    await copyFile(goRoute.filePath, goRouteBinary)
    await chmod(goRouteBinary, 0o755)
    const goRoutePort = await findPort()
    const goRouteEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(goRoutePort),
    }
    delete goRouteEnv.__NEXT_GO_TOKEN
    goRouteChild = spawn(goRouteBinary, [], {
      cwd: binaryDirectory,
      env: goRouteEnv,
      stdio: 'inherit',
    })
    goRouteOrigin = `http://127.0.0.1:${goRoutePort}`
    await retry(async () => {
      expect(
        (await fetchViaRawHttp(goRouteOrigin, '/unmatched-readiness')).status
      ).toBe(404)
    })
  }, coldGoBuildTimeout)

  afterAll(async () => {
    for (const childProcess of [child, goRouteChild]) {
      if (childProcess && childProcess.exitCode === null) {
        const exited = once(childProcess, 'exit')
        childProcess.kill()
        await exited
      }
    }
    if (binaryDirectory) {
      await rm(binaryDirectory, { recursive: true, force: true })
    }
  })

  async function requestAdapter(path: string) {
    const rawPath = path.startsWith('/docs/') ? path : `/docs${path}`
    const middleware = await fetchViaRawHttp(origin, rawPath)
    if (!middleware.headers.has('x-middleware-next')) return middleware
    const pathname = new URL(rawPath, origin).pathname
    const filePath =
      outputs.prerenders.find((item) => item.pathname === pathname)?.fallback
        ?.filePath ||
      outputs.staticFiles.find((item) => item.pathname === pathname)?.filePath
    if (filePath) {
      return new Response(new Uint8Array(await readFile(filePath)))
    }
    if (rawPath.startsWith('/docs/native-security/go/')) {
      // Adapters dispatch the original URL to the emitted Go route after Proxy
      // continues, rather than the pathname Proxy normalized for authorization.
      return fetchViaRawHttp(goRouteOrigin, rawPath)
    }
    return fetchViaRawHttp(next.url, rawPath)
  }

  it('rejects RSC suffixes that expose dot segments before Go routing', async () => {
    for (const path of [
      '/native-security/go/private/...rsc',
      '/native-security/go/private/.%2e.rsc',
      '/native-security/go/private/%2e..rsc',
      '/native-security/go/private/%2e%2e.rsc',
      '/native-security/go/private/...segments/_tree.segment.rsc',
      '/native-security/go/private/%2e%2e.segments/_tree.segment.rsc',
    ]) {
      await expectRejected(await requestAdapter(path), path)
    }
    const protectedResponse = await requestAdapter(
      '/native-security/go/private/value'
    )
    expect(protectedResponse.status).toBe(403)
    const response = await requestAdapter('/native-security/go/public/value')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      name: ['public', 'value'],
      secret: false,
    })
  })

  it('preserves query authorization through downstream handler invocation', async () => {
    await expectQueryAuthorization(requestAdapter)
  })

  it('rejects RSC suffixes that downstream route params would strip again', async () => {
    await expectRSCSuffixedParams(requestAdapter)
  })

  it('keeps Edge route params aligned with the authorized pathname', async () => {
    await expectEdgeParamAuthorization(requestAdapter)
  })

  it('rejects reserved Pages data forms before an App Router catch-all', async () => {
    for (const path of [
      '/_next/data/build/native-security/private.json',
      '/_next/data/build/native-security/private.json.rsc',
      '/_next/data/build/native-security/private.json.segments/_tree.segment.rsc',
    ]) {
      const response = await requestAdapter(path)
      expect({ path, status: response.status }).toEqual({ path, status: 404 })
      expect(await response.text()).not.toContain('"secret":true')
    }
  })

  it('rejects a literal # that would hide query fields from Go Proxy', async () => {
    // Go route handlers parse query fields after a literal #, so Proxy must
    // not authorize a target truncated at it.
    for (const path of [
      '/native-security/query?resource=public#&resource=private',
      '/native-security/query#?resource=private',
    ]) {
      const response = await fetchViaRawHttp(origin, `/docs${path}`)
      expect({ path, status: response.status }).toEqual({ path, status: 404 })
      expect(await response.text()).not.toContain('"secret":true')
    }
  })

  it('bounds query bytes and parameter counts before calling Go Proxy', async () => {
    for (const query of [
      'resource=private&value=' + 'a'.repeat(64 * 1024),
      'resource=private&' + '&'.repeat(4096),
    ]) {
      const response = await requestAdapter(`/native-security/query?${query}`)
      expect(response.status).toBe(414)
    }
  })

  it('denies access to genuine emitted private RSC and segment outputs', async () => {
    const privateOutputs = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/docs/native-security/private') &&
        output.pathname.endsWith('.rsc') &&
        output.fallback?.filePath
    )
    expect(privateOutputs.length).toBeGreaterThan(0)
    expect(
      privateOutputs.some((output) => output.pathname.endsWith('.segment.rsc'))
    ).toBe(true)
    for (const output of privateOutputs) {
      const response = await requestAdapter(output.pathname)
      expect({ path: output.pathname, status: response.status }).toEqual({
        path: output.pathname,
        status: 403,
      })
      expect(await response.text()).not.toContain(
        'private-native-proxy-payload'
      )
    }
  })

  it('continues to serve genuine public RSC and segment outputs', async () => {
    const publicOutputs = outputs.prerenders.filter(
      (output) =>
        output.pathname.startsWith('/docs/native-security/public') &&
        output.pathname.endsWith('.rsc') &&
        output.fallback?.filePath
    )
    expect(publicOutputs.length).toBeGreaterThan(0)
    for (const output of publicOutputs) {
      const response = await requestAdapter(output.pathname)
      expect({ path: output.pathname, status: response.status }).toEqual({
        path: output.pathname,
        status: 200,
      })
    }
  })
})
