import { nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  retry,
} from 'next-test-utils'
import { load } from 'cheerio'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'

describe('route-scoped-cache standalone', () => {
  const { next, skipped } = nextTestSetup({
    files: path.join(__dirname, '../route-scoped-cache'),
    skipStart: true,
    // Tests the self-hosted standalone distribution after moving it outside
    // the original build tree; a hosted deployment has no such launcher.
    skipDeployment: true,
    env: { STANDALONE: '1', CACHE_STORAGE: 'disk' },
  })
  if (skipped) return

  let directory: string
  let server: ChildProcess
  let port: number

  async function start() {
    port = await findPort()
    server = await initNextServerScript(
      path.join(directory, 'server.js'),
      /- Local:/,
      {
        ...process.env,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
      undefined,
      { cwd: directory }
    )
  }

  async function read(pathname: string) {
    const response = await fetchViaHTTP(port, pathname)
    expect(response.status).toBe(200)
    const body = await response.text()
    return response.headers.get('content-type')?.includes('application/json')
      ? JSON.parse(body)
      : JSON.parse(load(body)('#route-state').text())
  }

  beforeAll(async () => {
    const { exitCode } = await next.build()
    if (exitCode !== 0) throw new Error(`Fixture build failed: ${exitCode}`)
    directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'route-scoped-standalone-')
    )
    await fs.copy(path.join(next.testDir, '.next/standalone'), directory)
    await fs.copy(
      path.join(next.testDir, '.next/static'),
      path.join(directory, '.next/static')
    )
    await fs.copy(
      path.join(next.testDir, 'public'),
      path.join(directory, 'public')
    )
    await start()
  })

  afterAll(async () => {
    if (server) await killApp(server)
    if (directory) await fs.remove(directory)
  })

  it.each([
    ['/pages-victim/known', 'pages-victim'],
    ['/fr/pages-victim/known', 'pages-victim'],
    ['/app-victim/known', 'app-victim'],
    ['/api/victim/known', 'route-victim'],
    ['/source-hash/known', 'app-long-source'],
  ])(
    'normal: includes the prebuilt response for %s',
    async (pathname, route) => {
      const response = await read(pathname)
      expect(response.route).toBe(route)
      expect(response.params.id).toBe('known')
      expect(await read(pathname)).toEqual(response)
    }
  )

  it('normal: includes static Pages and public files', async () => {
    expect(await (await fetchViaHTTP(port, '/')).text()).toContain(
      'static-home'
    )
    expect(await (await fetchViaHTTP(port, '/plain.txt')).text()).toBe(
      'public-file\n'
    )
  })

  it('normal: writes runtime cache entries that survive restarting the standalone server', async () => {
    const before = await read('/pages-victim/runtime')
    expect(before.route).toBe('pages-victim')
    await killApp(server)
    await start()
    expect(await read('/pages-victim/runtime')).toEqual(before)
  })

  it('normal: revalidates using the public pathname in the standalone server', async () => {
    const before = await read('/pages-victim/on-demand')
    const response = await fetchViaHTTP(port, '/api/revalidate', undefined, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pathname: '/pages-victim/on-demand' }),
    })
    expect(response.status).toBe(200)
    await retry(async () => {
      const current = await read('/pages-victim/on-demand')
      expect(current.route).toBe('pages-victim')
      expect(current.generation).not.toBe(before.generation)
    })
  })

  it.each([
    ['/%70ages-victim', '/pages-victim', 'pages-catchall', 'pages-victim'],
    ['/%61pp-victim', '/app-victim', 'pages-catchall', 'app-victim'],
    [
      '/app-only/%76ictim',
      '/app-only/victim',
      'app-catchall',
      'app-only-victim',
    ],
    ['/%61pi/victim', '/api/victim', 'pages-catchall', 'route-victim'],
  ])(
    'security: isolates %s in the standalone distribution',
    async (alias, canonical, aliasOwner, owner) => {
      const first = await read(`${alias}/standalone`)
      expect(first.route).toBe(aliasOwner)
      const second = await read(`${canonical}/standalone`)
      expect(second.route).toBe(owner)
      expect(await read(`${alias}/standalone`)).toEqual(first)
      expect(await read(`${canonical}/standalone`)).toEqual(second)
    }
  )
})

describe('route-scoped-cache minimal-mode handler contract', () => {
  const { next, skipped } = nextTestSetup({
    files: path.join(__dirname, '../route-scoped-cache'),
    // This harness supplies trusted adapter routing metadata locally. Hosted
    // platforms perform their own route selection and filter client headers.
    skipDeployment: true,
    startCommand: 'node minimal-server.js',
    serverReadyPattern: /minimal server ready/,
  })
  if (skipped) return

  it.each([
    ['allowed', 200],
    ['not-found', 404],
  ])(
    'normal: preserves the App Handler publication allowlist for %s',
    async (id, status) => {
      const response = await next.fetch(`/api-admission/${id}`, {
        headers: { 'x-matched-path': '/api-admission/[...slug]' },
      })
      expect(response.status).toBe(status)
      expect((await response.json()).route).toBe('route-admission-closed')
    }
  )

  it.each(['published', 'not-found'])(
    'security: App Handler publication allowlist declines sibling admission for %s',
    async (id) => {
      const response = await next.fetch(`/api-admission/sibling/${id}`, {
        headers: { 'x-matched-path': '/api-admission/[...slug]' },
      })
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Server Error')
    }
  )

  it.each([
    ['/pages-victim/minimal', '/[...slug]', 'pages-catchall'],
    ['/pages-victim/minimal', '/pages-victim/[id]', 'pages-victim'],
    ['/closed/allowed', '/closed/[...slug]', 'pages-closed-catchall'],
    ['/fr/closed/allowed', '/closed/[...slug]', 'pages-closed-catchall'],
    ['/app-victim/minimal', '/[...slug]', 'pages-catchall'],
    ['/app-victim/minimal', '/app-victim/[id]', 'app-victim'],
    ['/app-only/victim/minimal', '/app-only/[...slug]', 'app-catchall'],
    ['/app-only/victim/minimal', '/app-only/victim/[id]', 'app-only-victim'],
  ])(
    'normal: honors the selected route %s → %s',
    async (pathname, selected, owner) => {
      const states = []
      for (let i = 0; i < 2; i++) {
        const response = await next.fetch(pathname, {
          headers: {
            'x-matched-path': selected,
            'x-invocation-id': 'shared-invocation',
          },
        })
        expect(response.status).toBe(200)
        const state = JSON.parse(
          load(await response.text())('#route-state').text()
        )
        expect(state.route).toBe(owner)
        states.push(state)
      }
      expect(states[1]).toEqual(states[0])
    }
  )

  it.each(['', '/fr'])(
    "normal: serves the closed route's own negative entry in locale %s",
    async (locale) => {
      const response = await next.fetch(`${locale}/closed/not-found`, {
        headers: { 'x-matched-path': '/closed/[...slug]' },
      })
      expect(response.status).toBe(404)
    }
  )

  it.each(
    ['', '/fr'].flatMap((locale) =>
      ['published', 'not-found'].map((id) => `${locale}/closed/sibling/${id}`)
    )
  )(
    'security: the selected closed route declines sibling admission for %s',
    async (pathname) => {
      const response = await next.fetch(pathname, {
        headers: { 'x-matched-path': '/closed/[...slug]' },
      })
      // This minimal harness maps a thrown NoFallbackError to 500. A real
      // adapter handles that signal at its route boundary. The closed route
      // must decline rather than render the excluded parameters.
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Server Error')
    }
  )
})
