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

async function expectLiteralParams(
  fetchRequest: (path: string) => Promise<Response>
) {
  for (const path of [
    '/native-security/resource/private%2Ersc',
    '/native-security/resource/parent/private%2Ersc',
    '/native-security/resource/private%2ersc',
    '/native-security/single/private%2Ersc',
  ]) {
    const response = await fetchRequest(path)
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.secret).toBe(false)
    expect(
      Array.isArray(result.name)
        ? result.name[result.name.length - 1]
        : result.name
    ).toBe('private.rsc')
  }
  expect((await fetchRequest('/native-security/resource/private')).status).toBe(
    403
  )
  for (const kind of ['resource', 'single']) {
    const literal = await fetchRequest(`/native-security/${kind}/literal.rsc`)
    expect(literal.status).toBe(200)
    expect(await literal.json()).toMatchObject({ secret: false })
    for (const suffix of ['literal%2Ersc', 'literal.rsc.rsc']) {
      expect(
        (await fetchRequest(`/native-security/${kind}/${suffix}`)).status
      ).toBe(403)
    }
  }
}

// Go middleware requires Turbopack, and released hosting builders do not yet
// support its artifact. Deployment-specific coverage below invokes that artifact.
// @force-gate turbopack && !deploy
describe.each(['go', 'typescript'])(
  'native proxy authorization with %s',
  (runtime) => {
    const { next } = nextTestSetup({ files: __dirname, skipStart: true })

    beforeAll(async () => {
      if (runtime === 'typescript') {
        await next.deleteFile('proxy.go')
        await next.patchFile(
          'proxy.ts',
          await next.readFile('proxy-reference.ts')
        )
      }
      await next.start()
    })

    it('authorizes the same query values as the App Router handler', async () => {
      await expectQueryAuthorization((path) => next.fetch(path))
    })

    it('preserves literal RSC suffixes in decoded route parameters', async () => {
      await expectLiteralParams((path) => next.fetch(path))
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
  }
)

type CapturedOutputs = {
  middleware: { filePath: string }
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
// @force-gate turbopack && start
describe('adapter Go proxy authorization', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    startCommand: 'node adapter-server.mjs',
    serverReadyPattern: /Adapter server ready/,
  })
  let child: ChildProcess | undefined
  let binaryDirectory: string | undefined
  let origin: string
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
  })

  afterAll(async () => {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit')
      child.kill()
      await exited
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
    return fetchViaRawHttp(next.url, rawPath)
  }

  it('preserves query authorization through downstream handler invocation', async () => {
    await expectQueryAuthorization(requestAdapter)
  })

  it('preserves literal suffixes through downstream route matching', async () => {
    await expectLiteralParams(requestAdapter)
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
