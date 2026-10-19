import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { request } from 'http'
import { promises as fs } from 'fs'
import { join } from 'path'

// @force-gate turbopack && (linux || macos)
describe('Go public frontend', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Owns public and loopback listeners and launches a host executable.
    skipDeployment: true,
  })
  const pids = new Set<number>()
  afterAll(async () => {
    for (const pid of pids)
      await retry(async () => expect(() => process.kill(pid, 0)).toThrow())
  })
  async function native(path = '/native/example') {
    const response = await next.fetch(path)
    expect(response.status).toBe(201)
    const data = await response.json()
    pids.add(data.pid)
    return data
  }
  it('serves independent native packages from one application worker', async () => {
    const data = await native('/native/a%20b?key=one&key=two')
    expect(data).toMatchObject({
      id: 'a b',
      query: 'key=one&key=two',
      sibling: 'sibling-v1',
      dependency: 'transitive-v1',
      embedded: 'embedded-v1',
      appInternal: 'app-internal-v1',
      proxy: '',
    })
    expect((await (await next.fetch('/another')).json()).pid).toBe(data.pid)
    expect((await native()).pid).toBe(data.pid)
    expect(await (await next.fetch('/catch/one/two%2Fthree')).json()).toEqual([
      'one',
      'two/three',
    ])
    expect(next.cliOutput).toContain('Go frontend ready at')
  })
  it('routes Go directly while preserving Node fallback routing and proxy', async () => {
    const direct = await next.fetch('/native/direct', {
      headers: {
        'x-next-go-token': 'forged',
        'x-next-go-params': 'forged',
        'x-next-go-upstream-token': 'forged',
      },
    })
    expect(direct.status).toBe(201)
    expect(direct.headers.get('x-node-proxy')).toBeNull()
    expect((await direct.json()).id).toBe('direct')
    const js = await next.fetch('/alias')
    expect(js.headers.get('x-node-proxy')).toBe('yes')
    const data = await js.json()
    expect(data.language).toBe('js')
    expect(data.privateToken).toBeNull()
    expect(data.pid).not.toBe((await native()).pid)
    expect(await next.render('/native/static')).toBe('static JS route')
    expect(await next.render('/native/asset.txt')).toBe('public asset\n')
    expect(await next.render('/native/a%20b.txt')).toBe(
      'encoded public asset\n'
    )
    expect(await next.render('/')).toContain('hello world')
    expect(await next.render('/legacy')).toContain('legacy page')
    const html = await next.render('/')
    const asset = html.match(/src="([^" ]+\.js[^" ]*)"/)
    expect(asset).not.toBeNull()
    expect((await next.fetch(asset![1].replace(/&amp;/g, '&'))).status).toBe(
      200
    )
    expect((await next.fetch('/missing')).status).toBe(404)
  })
  it('handles optional catch-all and default slash normalization', async () => {
    expect(await (await next.fetch('/optional')).json()).toEqual([])
    expect(await (await next.fetch('/optional/a/b%2Fc')).json()).toEqual([
      'a',
      'b/c',
    ])
    const redirect = await next.fetch('/native/example/?key=one', {
      redirect: 'manual',
    })
    expect(redirect.status).toBe(308)
    expect(redirect.headers.get('location')).toBe('/native/example?key=one')
  })
  it('keeps Node private and strips the frontend authentication header', async () => {
    const backend = (await native()).backend
    expect(backend).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const response = await fetch(backend + '/js', {
      headers: { 'x-next-go-upstream-token': 'forged' },
    })
    expect(response.status).toBe(403)
    const headers = await (await next.fetch('/api/headers')).json()
    expect(headers.headers['x-next-go-upstream-token']).toBeUndefined()
    expect(
      headers.raw
        .filter((_: string, index: number) => index % 2 === 0)
        .map((name: string) => name.toLowerCase())
    ).not.toContain('x-next-go-upstream-token')
  })
  it('preserves HTTP methods, cookies, request and response streaming', async () => {
    const response = await next.fetch('/native/body', {
      method: 'POST',
      body: 'streamed body',
    })
    expect(response.headers.get('set-cookie')).toContain('first=1')
    expect(response.headers.get('set-cookie')).toContain('second=2')
    expect((await response.json()).body).toBe('streamed body')
    const head = await next.fetch('/native/head', { method: 'HEAD' })
    expect(head.status).toBe(201)
    expect(await head.text()).toBe('')
    const options = await next.fetch('/native/method', { method: 'OPTIONS' })
    expect(options.status).toBe(204)
    expect(options.headers.get('allow')).toBe('GET, HEAD, POST, OPTIONS')
    expect(
      (await next.fetch('/native/method', { method: 'DELETE' })).status
    ).toBe(405)
    await new Promise<void>((resolve, reject) => {
      const req = request(next.url + '/native/stream?stream=1', (res) => {
        res.once('data', (chunk) => {
          try {
            expect(chunk.toString()).toBe('first')
            res.destroy()
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect((await native()).id).toBe('example')
  })
  it('serves Go while Node is occupied by a fallback request', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = request(next.url + '/block', (res) => {
        let complete = false
        res.once('end', () => {
          complete = true
        })
        res.once('data', async () => {
          try {
            await retry(async () =>
              expect(
                await fs.readFile(join(next.testDir, 'node-occupied'), 'utf8')
              ).toBe('ready')
            )
            expect((await native()).id).toBe('example')
            expect(complete).toBe(false)
            res.resume()
            res.once('end', resolve)
          } catch (error) {
            reject(error)
          }
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    })
  })
  it('relocates the executable and starts without a Go compiler', async () => {
    const descriptor = JSON.parse(
      await next.readFile('.next/server/go-server.json')
    )
    const trace = JSON.parse(
      await next.readFile('.next/server/go-server.json.nft.json')
    )
    expect(trace.files).toEqual([descriptor.executable, descriptor.frontend])
    expect(descriptor.version).toBe(2)
    expect(descriptor.workers[0].protocol).toBe('next-worker-http/1')
    const stat = await fs.stat(
      join(next.testDir, '.next/server', descriptor.executable)
    )
    if (process.platform !== 'win32') expect(stat.mode & 0o111).not.toBe(0)
    const old = (await native()).pid
    await next.stop()
    await retry(async () => expect(() => process.kill(old, 0)).toThrow())
    await next.renameFolder('.next', '.next-relocated')
    await next.patchFile('next.config.ts', (s) =>
      s.replace('experimental:', "distDir: '.next-relocated', experimental:")
    )
    await next.start({
      skipBuild: true,
      env: { TURBOPACK_GO: '/missing-go-toolchain' },
    })
    expect((await native()).id).toBe('example')
    expect(await next.render('/legacy')).toContain('legacy page')
  })
})

// @force-gate turbopack && (linux || macos)
describe('Go frontend URL configuration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // Native host executable and public listener are self-hosted only.
    skipDeployment: true,
  })
  beforeAll(async () => {
    await next.patchFile('next.config.ts', (s) =>
      s.replace(
        'experimental:',
        "basePath: '/null', trailingSlash: true, experimental:"
      )
    )
    await next.start()
  })
  it('honors basePath and trailingSlash for native routes and Node fallback', async () => {
    const redirect = await next.fetch('/null/native/base?key=one', {
      redirect: 'manual',
    })
    expect(redirect.status).toBe(308)
    expect(redirect.headers.get('location')).toBe('/null/native/base/?key=one')
    const response = await next.fetch('/null/native/base/')
    expect(response.status).toBe(201)
    expect((await response.json()).id).toBe('base')
    expect(await (await next.fetch('/null/optional/')).json()).toEqual([])
    expect(await next.render('/null/')).toContain('hello world')
    expect(await next.render('/null/native/asset.txt')).toBe('public asset\n')
    expect((await next.fetch('/native/outside/')).status).toBe(404)
  })
})
