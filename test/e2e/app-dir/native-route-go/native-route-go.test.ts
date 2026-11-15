import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP, fetchViaRawHttp, findPort, retry } from 'next-test-utils'
import { request } from 'http'
import { promises as fs } from 'fs'
import { dirname, join, relative } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import type { AdapterOutput, NextAdapter } from 'next'
import { getRouteMatcher } from 'next/dist/shared/lib/router/utils/route-matcher'
import { getRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex'

async function expectParameterParity(
  pattern: string,
  fetchPath: (path: string) => ReturnType<typeof fetchViaHTTP>
) {
  const reference = getRouteMatcher(getRouteRegex(pattern))
  const prefix = pattern.slice(0, pattern.indexOf('/['))
  const single = pattern.endsWith('/[id]')
  for (const encoded of [
    'a%2Fb',
    'a%252Fb',
    'caf%C3%A9',
    '%F0%9F%98%80',
    'one+two',
    '%255Bslug%255D',
    '_NEXTSEP_first',
    '_NEXTSEP__NEXTSEP_first',
  ]) {
    const path = `${prefix}/${encoded}${single ? '' : '/_NEXTSEP_tail%252Fend'}`
    const params = reference(path)
    if (params === false) throw new Error(`Reference did not match ${path}`)
    const response = await fetchPath(path)
    expect(response.status).toBe(single ? 201 : 200)
    const body = await response.json()
    if (single) {
      expect(body.id).toEqual(params.id)
      expect(body.privateMetadata).toBe(false)
    } else if (Array.isArray(body)) {
      expect(body).toEqual(params.slug)
    } else {
      expect(body.params).toEqual(params.slug)
      expect(body.value).toEqual((params.slug as string[]).join('/'))
    }
    if (!Array.isArray(body)) {
      expect(body.path).toBe(path)
      expect(body.requestURI).toBe(path)
    }
  }
  if (pattern.endsWith('/[[...slug]]')) {
    expect(reference(prefix)).toEqual({})
    const response = await fetchPath(prefix)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ params: null, value: '' })
  }
  for (const encoded of [
    '%FF',
    '%C0%AF',
    '%ED%A0%80',
    '%F0%80%80%80',
    '%invalid',
  ]) {
    const path = `${prefix}/${encoded}`
    expect(() => reference(path)).toThrow('failed to decode param')
    expect((await fetchPath(path)).status).toBe(400)
  }
}

async function expectAutomaticMethods(
  fetchMethod: (method: string) => ReturnType<typeof fetchViaHTTP>
) {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetchMethod(method)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-handled-by')).toBe(method)
    expect(await response.text()).toBe(method)
  }
  const head = await fetchMethod('HEAD')
  expect(head.status).toBe(200)
  expect(head.headers.get('x-handled-by')).toBe('GET')
  expect(await head.text()).toBe('')
  const options = await fetchMethod('OPTIONS')
  expect(options.status).toBe(204)
  expect(options.headers.get('allow')).toBe(
    'DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT'
  )
  expect(await options.text()).toBe('')
}

async function expectExplicitMethods(
  fetchMethod: (method: string) => ReturnType<typeof fetchViaHTTP>
) {
  const get = await fetchMethod('GET')
  expect(get.status).toBe(200)
  expect(get.headers.get('x-handled-by')).toBe('GET')
  expect(await get.text()).toBe('GET')
  const head = await fetchMethod('HEAD')
  expect(head.status).toBe(202)
  expect(head.headers.get('x-handled-by')).toBe('HEAD')
  expect(await head.text()).toBe('')
  const options = await fetchMethod('OPTIONS')
  expect(options.status).toBe(202)
  expect(options.headers.get('x-handled-by')).toBe('OPTIONS')
  expect(options.headers.get('allow')).toBe('OPTIONS')
  expect(await options.text()).toBe('explicit OPTIONS')
  const missing = await fetchMethod('POST')
  expect(missing.status).toBe(405)
  expect(await missing.text()).toBe('')
}

// @force-gate turbopack
describe('native-route-go', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    // No configured deployment adapter supports runtime: 'go'; see README.md.
    // Copied adapter executables and their HTTP contract are verified in start mode.
    skipDeployment: true,
    env: {
      // Node's route-table watcher also needs polling in this fixture.
      WATCHPACK_POLLING: '50',
      TURBO_ENGINE_IGNORE_DIRTY: '1',
      TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS: '1000',
      TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
    },
  })
  const route = 'app/(group)/native/[id]/route.go'
  const helper = 'app/(group)/native/[id]/helper.go'
  const nativePids = new Set<number>()
  const asset = 'app/(group)/native/[id]/assets/message.txt'
  const data = async (url = '/native/example') => {
    const response = await next.fetch(url)
    expect(response.status).toBe(201)
    const result = await response.json()
    nativePids.add(result.pid)
    return result
  }
  const lifecyclePid = () =>
    retry(async () => {
      const response = await next.fetch('/lifecycle')
      expect(response.status).toBe(200)
      const { pid } = await response.json()
      nativePids.add(pid)
      return pid as number
    }, 30_000)
  afterAll(async () => {
    for (const pid of nativePids) {
      await retry(async () => {
        expect(() => process.kill(pid, 0)).toThrow()
      })
    }
  })
  it('serves native methods, params, headers, cookies, query, and streamed request bodies', async () => {
    const response = await next.fetch('/native/a%20b?key=one&key=two', {
      method: 'POST',
      body: 'request body',
    })
    expect(response.status).toBe(201)
    expect(response.headers.get('x-handled-by')).toBe('POST')
    expect(response.headers.get('x-native-route')).toBe('yes')
    expect(response.headers.get('set-cookie')).toContain('first=1')
    expect(response.headers.get('set-cookie')).toContain('second=2')
    expect(response.headers.get('vary')).toContain('X-Proxy')
    expect(response.headers.get('vary')).toContain('X-Go')
    expect(response.headers.get('link')).toContain('</proxy.css>')
    expect(response.headers.get('link')).toContain('</go.css>')
    expect(await response.json()).toMatchObject({
      id: 'a b',
      method: 'POST',
      query: 'key=one&key=two',
      body: 'request body',
      sibling: 'sibling-v1',
      dependency: 'transitive-v1',
      embedded: 'embedded-v1',
      proxy: '1',
    })
    const get = await next.fetch('/native/get')
    expect(get.status).toBe(201)
    expect(get.headers.get('x-handled-by')).toBe('GET')
    expect((await get.json()).method).toBe('GET')
    const head = await next.fetch('/native/head', { method: 'HEAD' })
    expect(head.status).toBe(201)
    expect(head.headers.get('x-handled-by')).toBe('GET')
    expect(await head.text()).toBe('')
    const options = await next.fetch('/native/options', { method: 'OPTIONS' })
    expect(options.status).toBe(204)
    expect(options.headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST')
    expect(
      (await next.fetch('/native/method', { method: 'DELETE' })).status
    ).toBe(405)
  })
  it('finishes oversized proxied uploads when proxy copies the original Content-Length', async () => {
    const response = await next.fetch('/native/upload', {
      method: 'POST',
      body: 'x'.repeat(128 * 1024),
      signal: AbortSignal.timeout(10_000),
    })
    expect(response.status).toBe(201)
    const result = await response.json()
    expect(result.body.length).toBeLessThanOrEqual(64 * 1024)
    expect(result.contentLength).toBe(result.body.length)
    expect(result.proxy).toBe('1')
  })
  it('dispatches every declared method and automatically implements HEAD and sorted OPTIONS', async () => {
    await expectAutomaticMethods((method) => next.fetch('/methods', { method }))
  })
  it('prefers explicit HEAD and OPTIONS handlers and rejects missing methods', async () => {
    await expectExplicitMethods((method) =>
      next.fetch('/explicit-methods', { method })
    )
  })
  it('uses Node routing, rewrites and proxy exactly once and coexists with JS and Pages', async () => {
    expect(await data('/rewritten/rewritten')).toMatchObject({
      id: 'rewritten',
      proxy: '1',
    })
    expect(await data('/proxy-target')).toMatchObject({
      id: 'proxy',
      proxy: '1',
    })
    expect(await (await next.fetch('/catch/one/two%20three')).json()).toEqual([
      'one',
      'two three',
    ])
    expect(await (await next.fetch('/js')).json()).toEqual({ language: 'js' })
    expect(await next.render('/legacy')).toContain('legacy page')
    expect(await next.render('/')).toContain('hello world')
  })
  it('reuses the process and ignores forged native metadata', async () => {
    const first = await data()
    expect((await data()).pid).toBe(first.pid)
    const response = await fetchViaRawHttp(next.url, '/native/trusted', {
      headers: {
        connection: 'x-next-internal-go-token',
        'x-next-internal-go-token': 'forged',
      },
    })
    expect(response.status).toBe(201)
    const result = await response.json()
    expect(result.id).toBe('trusted')
    expect(result.privateMetadata).toBe(false)
    for (const headers of [
      {},
      { 'x-next-internal-go-token': 'wrong' },
    ] as Record<string, string>[]) {
      const direct = await fetchViaHTTP(
        `http://${result.address}`,
        '/native/trusted',
        undefined,
        { headers }
      )
      expect(direct.status).toBe(403)
    }
  })
  it('matches Next parameter decoding and normalization', async () => {
    for (const pattern of [
      '/native/[id]',
      '/catch/[...slug]',
      '/adapter-optional/[[...slug]]',
    ]) {
      await expectParameterParity(pattern, (path) => next.fetch(path))
    }
  })
  it('passes the rewritten destination URL and derives parameters from it', async () => {
    for (const [source, destination, id] of [
      ['/alias', '/native/123', '123'],
      ['/rewritten/a%2Fb', '/native/a%2Fb', 'a/b'],
      ['/native/original', '/native/rewritten', 'rewritten'],
      ['/proxy-target', '/native/proxy', 'proxy'],
    ]) {
      expect(await data(`${source}?key=one&key=two`)).toMatchObject({
        id,
        path: destination,
        requestURI: `${destination}?key=one&key=two`,
        query: 'key=one&key=two',
      })
    }
    const catchAll = await next.fetch('/catch-alias/one%2Ftwo/three%20four')
    expect(catchAll.status).toBe(200)
    expect(await catchAll.json()).toEqual(['one/two', 'three four'])
    for (const [source, destination, params] of [
      ['/optional-alias', '/adapter-optional', null],
      [
        '/optional-alias/one%2Ftwo/three%20four',
        '/adapter-optional/one%2Ftwo/three%20four',
        ['one/two', 'three four'],
      ],
    ] as const) {
      const response = await next.fetch(`${source}?key=one&key=two`)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        params,
        path: destination,
        requestURI: `${destination}?key=one&key=two`,
        query: 'key=one&key=two',
      })
    }
    const response = await next.fetch('/static-alias?key=one&key=two')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      path: '/adapter-static',
      requestURI: '/adapter-static?key=one&key=two',
      query: 'key=one&key=two',
    })
  })
  it('includes basePath in rewritten Go destination URLs', async () => {
    const config = await next.readFile('next.config.ts')
    try {
      await next.stop()
      await next.patchFile(
        'next.config.ts',
        config.replace(
          'experimental:',
          "basePath: '/go-base',\n  experimental:"
        )
      )
      await next.start()
      expect(await data('/go-base/rewritten/a%2Fb?sort=asc')).toMatchObject({
        id: 'a/b',
        path: '/go-base/native/a%2Fb',
        requestURI: '/go-base/native/a%2Fb?sort=asc',
        query: 'sort=asc',
      })
      const response = await next.fetch(
        '/go-base/optional-alias/one%2Ftwo/three%20four?sort=asc'
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        params: ['one/two', 'three four'],
        path: '/go-base/adapter-optional/one%2Ftwo/three%20four',
        requestURI: '/go-base/adapter-optional/one%2Ftwo/three%20four?sort=asc',
        query: 'sort=asc',
      })
    } finally {
      await next.stop()
      await next.patchFile('next.config.ts', config)
      await next.start()
    }
  })
  it('preserves repeated request headers and cancels streaming responses', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = request(
        next.url + '/native/repeated',
        { headers: { 'x-repeated': ['one', 'two'], constructor: 'safe' } },
        (res) => {
          let body = ''
          res.on('data', (chunk) => {
            body += chunk
          })
          res.on('end', () => {
            try {
              expect(JSON.parse(body).repeated).toEqual(['one', 'two'])
              resolve()
            } catch (err) {
              reject(err)
            }
          })
        }
      )
      req.on('error', reject)
      req.end()
    })
    await new Promise<void>((resolve, reject) => {
      const req = request(next.url + '/native/stream?stream=1', (res) => {
        res.once('data', (chunk) => {
          expect(chunk.toString()).toBe('first')
          res.destroy()
          resolve()
        })
      })
      req.on('error', reject)
      req.end()
    })
    expect((await data()).id).toBe('example')
  })
  it('recovers after a native process crash', async () => {
    const first = await data()
    expect((await next.fetch('/native/crash?crash=1')).status).toBe(500)
    await retry(async () => {
      expect((await data()).pid).not.toBe(first.pid)
    })
  })
  if (isNextDev) {
    it.each(['delete', 'rename', 'replace'])(
      'retires the Go worker after route %s',
      async (change) => {
        const path = 'app/lifecycle/route.go'
        const source = await next.readFile(path)
        const pid = await lifecyclePid()
        try {
          if (change === 'replace') {
            await next.patchFile(
              'app/lifecycle/route.ts',
              'export function GET() { return new Response("javascript") }'
            )
          }
          if (change === 'rename') {
            await next.renameFolder('app/lifecycle', 'app/lifecycle-renamed')
          } else {
            await next.deleteFile(path)
          }
          await retry(async () => {
            expect(() => process.kill(pid, 0)).toThrow()
          }, 30_000)
          if (change === 'replace') {
            await retry(async () => {
              expect(await next.render('/lifecycle')).toBe('javascript')
            }, 30_000)
          }
        } finally {
          if (change === 'rename') {
            await next.renameFolder('app/lifecycle-renamed', 'app/lifecycle')
          } else {
            if (change === 'replace')
              await next.deleteFile('app/lifecycle/route.ts')
            await next.patchFile(path, source)
          }
        }
      }
    )
    it('drains an active request when its Go route is removed', async () => {
      const path = 'app/lifecycle/route.go'
      const source = await next.readFile(path)
      const controller = new AbortController()
      try {
        await lifecyclePid()
        const response = await next.fetch('/lifecycle?stream=1', {
          // Compression can buffer this deliberately unfinished JSON response.
          headers: { 'accept-encoding': 'identity' },
          signal: controller.signal,
        })
        const reader = response.body.getReader()
        let line = ''
        while (!line.includes('\n')) {
          const { value, done } = await reader.read()
          expect(done).toBe(false)
          line += new TextDecoder().decode(value)
        }
        const { pid } = JSON.parse(line)
        nativePids.add(pid)
        await next.deleteFile(path)
        await retry(async () => {
          expect((await next.fetch('/lifecycle')).status).toBe(404)
        }, 30_000)
        expect(() => process.kill(pid, 0)).not.toThrow()
        controller.abort()
        await reader.cancel().catch(() => {})
        await retry(async () => {
          expect(() => process.kill(pid, 0)).toThrow()
        }, 30_000)
      } finally {
        controller.abort()
        await next.patchFile(path, source)
      }
    })
    it('reports conflicting Go and TS handlers from Rust and recovers', async () => {
      const path = 'app/(group)/native/[id]/route.ts'
      const outputStart = next.cliOutput.length
      try {
        await next.patchFile(
          path,
          'export function GET() { return new Response("conflict") }'
        )
        await retry(async () => {
          expect((await next.fetch('/native/example')).status).toBe(500)
          expect(next.cliOutput.slice(outputStart)).toContain(
            'Conflicting App Router handlers'
          )
        }, 30_000)
      } finally {
        await next.deleteFile(path)
      }
      await retry(async () => {
        expect((await data()).id).toBe('example')
      }, 30_000)
    })
    it('reports the disabled Go experiment from Rust and recovers when enabled', async () => {
      const config = await next.readFile('next.config.ts')
      try {
        await next.stop()
        await next.patchFile(
          'next.config.ts',
          config.replace('goRoutes: true', 'goRoutes: false')
        )
        await next.start({ env: { TURBOPACK_GO: '/missing-go-toolchain' } })
        expect((await next.fetch('/native/disabled')).status).toBe(500)
        expect(next.cliOutput).toContain(
          'route.go requires experimental.goRoutes: true'
        )
      } finally {
        await next.stop()
        await next.patchFile('next.config.ts', config)
        await next.start()
      }
      expect((await data()).id).toBe('example')
    })
    it('repairs ordinary JS route errors alongside native routes', async () => {
      const source = await next.readFile('app/js/route.ts')
      try {
        await next.patchFile('app/js/route.ts', 'export function GET( {')
        expect((await next.fetch('/js')).status).toBe(500)
      } finally {
        await next.patchFile('app/js/route.ts', source)
      }
      await retry(async () => {
        const response = await next.fetch('/js')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ language: 'js' })
      })
    })

    it('rebuilds the dispatch table and Allow header when method declarations change', async () => {
      const path = 'app/methods/route.go'
      const source = await next.readFile(path)
      try {
        await next.patchFile(
          path,
          source.replace('func DELETE(', 'func deleted(')
        )
        await retry(async () => {
          expect(
            (await next.fetch('/methods', { method: 'DELETE' })).status
          ).toBe(405)
          const options = await next.fetch('/methods', { method: 'OPTIONS' })
          expect(options.status).toBe(204)
          expect(options.headers.get('allow')).toBe(
            'GET, HEAD, OPTIONS, PATCH, POST, PUT'
          )
        })
      } finally {
        await next.patchFile(path, source)
      }
      await retry(async () => {
        const response = await next.fetch('/methods', { method: 'DELETE' })
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('DELETE')
        const options = await next.fetch('/methods', { method: 'OPTIONS' })
        expect(options.headers.get('allow')).toBe(
          'DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT'
        )
      })
    })
    it('rebuilds route, siblings, transitive imports and embeds, and repairs compiler errors', async () => {
      const initial = await data()
      await next.patchFile(helper, (s) => s.replace('sibling-v1', 'sibling-v2'))
      await retry(async () => {
        const current = await data()
        expect(current.sibling).toBe('sibling-v2')
        expect(current.pid).not.toBe(initial.pid)
      })
      await retry(async () => {
        expect(() => process.kill(initial.pid, 0)).toThrow()
      })
      await fs.writeFile(
        join(next.testDir, helper),
        (await next.readFile(helper)).replace('sibling-v2', 'sibling-immediate')
      )
      // No watcher-settling delay: the first request must ensure current inputs.
      expect((await data()).sibling).toBe('sibling-immediate')
      await next.patchFile('internal/deep/message.go', (s) =>
        s.replace('transitive-v1', 'transitive-v2')
      )
      await retry(async () => {
        expect((await data()).dependency).toBe('transitive-v2')
      })
      await next.patchFile(asset, 'embedded-v2')
      await retry(async () => {
        expect((await data()).embedded).toBe('embedded-v2')
      })
      await next.patchFile('app/(group)/native/[id]/assets/extra.txt', 'extra')
      await retry(async () => {
        expect((await data()).assetCount).toBe(2)
      })
      await next.deleteFile('app/(group)/native/[id]/assets/extra.txt')
      await retry(async () => {
        expect((await data()).assetCount).toBe(1)
      })
      const original = await next.readFile(route)
      await next.patchFile(
        route,
        original.replace('func GET', 'invalid syntax\nfunc GET')
      )
      await retry(async () => {
        expect((await next.fetch('/native/error')).status).toBe(500)
      })
      expect(next.cliOutput).toContain('route.go')
      await next.patchFile(route, original)
      await retry(async () => {
        expect((await data()).id).toBe('example')
      })
    })
    it('repairs a first compilation failure and survives a persistent cache restart', async () => {
      const path = 'app/first-error/route.go'
      const source =
        'package main\nimport "net/http"\nfunc GET(w http.ResponseWriter, r *http.Request) { w.Write([]byte("first-repaired")) }\n'
      const outputStart = next.cliOutput.length
      await next.patchFile(path, source + '\ninvalid syntax\n')
      // A newly added route enters the polling route table asynchronously.
      await retry(async () => {
        expect((await next.fetch('/first-error')).status).toBe(500)
        const output = next.cliOutput.slice(outputStart)
        expect(output).toContain('app/first-error/route.go')
        expect(output).toContain('syntax error')
      }, 30_000)
      await next.patchFile(path, source)
      await retry(async () => {
        expect(await next.render('/first-error')).toBe('first-repaired')
      })
      const before = await data()
      await next.stop()
      try {
        const entries = await fs.readdir(
          join(next.testDir, next.distDir, 'cache', 'turbopack'),
          { recursive: true, withFileTypes: true }
        )
        let cacheSize = 0
        for (const entry of entries) {
          if (entry.isFile()) {
            cacheSize += (
              await fs.stat(join(entry.parentPath ?? entry.path, entry.name))
            ).size
          }
        }
        expect(cacheSize).toBeGreaterThan(0)
      } finally {
        await next.start()
      }
      expect((await data()).id).toBe('example')
      expect(await next.render('/first-error')).toBe('first-repaired')
      expect(() => process.kill(before.pid, 0)).toThrow()
      // Discovery must register watchers again after restoring persistent compiler output.
      await next.patchFile(
        path,
        source.replace('first-repaired', 'after-restart')
      )
      await retry(async () => {
        expect(await next.render('/first-error')).toBe('after-restart')
      })
      await next.patchFile(path, source + '\ninvalid syntax\n')
      await retry(async () => {
        expect((await next.fetch('/first-error')).status).toBe(500)
      })
      await next.patchFile(path, source)
      await retry(async () => {
        expect(await next.render('/first-error')).toBe('first-repaired')
      })
      await next.deleteFile(path)
    })
    it('caches startup errors and repairs them after an edit', async () => {
      const path = 'app/startup/route.go'
      const source =
        'package main\nimport "net/http"\nfunc init() { panic("startup-fixture-error") }\nfunc GET(w http.ResponseWriter, r *http.Request) { w.Write([]byte("recovered")) }\n'
      await next.patchFile(path, source)
      // Route-table discovery can lag behind creation of the source file.
      await retry(async () => {
        expect((await next.fetch('/startup')).status).toBe(500)
      }, 30_000)
      const failures = () =>
        (next.cliOutput.match(/panic: startup-fixture-error/g) || []).length
      expect(failures()).toBe(1)
      expect((await next.fetch('/startup')).status).toBe(500)
      expect(failures()).toBe(1)
      await next.patchFile(
        path,
        source.replace('func init() { panic("startup-fixture-error") }', '')
      )
      await retry(async () => {
        expect(await next.render('/startup')).toBe('recovered')
      })
    })
    it('discovers route additions, removals and renames', async () => {
      const source = await next.readFile('app/catch/[...slug]/route.go')
      await next.patchFile('app/added/route.go', source)
      // A request issued before discovery can compile the 404 page first.
      await retry(async () => {
        expect((await next.fetch('/added')).status).toBe(200)
      }, 30_000)
      await next.renameFolder('app/added', 'app/renamed')
      await retry(async () => {
        expect((await next.fetch('/added')).status).toBe(404)
        expect((await next.fetch('/renamed')).status).toBe(200)
      }, 30_000)
      await next.deleteFile('app/renamed/route.go')
      await retry(async () => {
        expect((await next.fetch('/renamed')).status).toBe(404)
      }, 30_000)
    })
  }
  if (isNextStart) {
    it('retries a transient worker startup failure in production', async () => {
      const trace = await next.readJSON('.next/next-server.js.nft.json')
      for (const filename of [
        'native-route.external.js',
        'native-route-proxy.js',
      ]) {
        expect(
          trace.files.some((file: string) =>
            file.replace(/\\/g, '/').endsWith(filename)
          )
        ).toBe(true)
      }
      await next.stop()
      try {
        await next.start({
          skipBuild: true,
          env: {
            NEXT_TEST_GO_STARTUP_FAIL_ONCE_PATH: join(
              next.testDir,
              'startup-once'
            ),
          },
        })
        expect((await next.fetch('/native/first-start')).status).toBe(500)
        expect((await data('/native/retried-start')).id).toBe('retried-start')
      } finally {
        await next.stop()
        await next.start({ skipBuild: true })
      }
    })

    it('starts relocated output without a Go toolchain', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/server/app-paths-manifest.json')
      )
      const entry = manifest['/(group)/native/[id]/route']
      const descriptor = JSON.parse(
        await next.readFile('.next/server/' + entry)
      )
      const trace = JSON.parse(
        await next.readFile('.next/server/' + entry + '.nft.json')
      )
      expect(trace.files).toHaveLength(1)
      expect(trace.files[0]).toContain('route-')
      const metadata = await fs.stat(
        join(next.testDir, '.next/server', descriptor.executable)
      )
      if (process.platform !== 'win32')
        expect(metadata.mode & 0o111).not.toBe(0)
      await next.stop()
      await next.renameFolder('.next', '.next-relocated')
      const config = await next.readFile('next.config.ts')
      await next.patchFile(
        'next.config.ts',
        config.replace(
          'experimental:',
          "distDir: '.next-relocated',\n  experimental:"
        )
      )
      await next.start({
        skipBuild: true,
        env: { TURBOPACK_GO: '/missing-go-toolchain' },
      })
      expect((await data()).id).toBe('example')
    })
    // This exercises host builds and startup checks for packaged servers.
    it('emits standalone Go adapter outputs alongside existing Node outputs', async () => {
      await next.stop()
      await next.patchFile('next.config.ts', (config) =>
        config.replace(
          'experimental:',
          `basePath: '/adapter-base',\n  adapterPath: ${JSON.stringify(join(next.testDir, 'capture-adapter.mjs'))},\n  experimental:`
        )
      )
      const result = await next.build()
      expect(result.exitCode).toBe(0)

      const context: Parameters<NextAdapter['onBuildComplete']>[0] =
        await next.readJSON('go-adapter-output.json')
      const goOutputs = context.outputs.appRoutes.filter(
        (output) => output.runtime === 'go'
      )
      const nodeOutput = context.outputs.appRoutes.find(
        (output) => output.pathname === '/adapter-base/js'
      )!
      expect(nodeOutput.runtime).toBe('nodejs')
      expect(nodeOutput.filePath).toMatch(/\.js$/)
      expect(context.outputs.staticFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pathname: '/adapter-base/legacy',
            type: 'STATIC_FILE',
            filePath: expect.stringMatching(/\.html$/),
          }),
        ])
      )
      expect(
        context.outputs.pages.every((output) => output.runtime === 'nodejs')
      ).toBe(true)
      expect(goOutputs.map((output) => output.pathname).sort()).toEqual([
        '/adapter-base/adapter-optional/[[...slug]]',
        '/adapter-base/adapter-special/café a 100%',
        '/adapter-base/adapter-static',
        '/adapter-base/catch/[...slug]',
        '/adapter-base/explicit-methods',
        '/adapter-base/lifecycle',
        '/adapter-base/methods',
        '/adapter-base/native/[id]',
      ])
      for (const output of goOutputs) {
        expect(output.type).toBe('APP_ROUTE')
        // Go changes the runtime value without adding producer metadata keys.
        expect(Object.keys(output).sort()).toEqual(
          Object.keys(nodeOutput).sort()
        )
        expect(output).not.toHaveProperty('sourceFile')
        expect(output).not.toHaveProperty('target')
        expect(output.filePath).not.toMatch(/\.native\.json$/)
        expect(Object.values(output.assets)).not.toContain(output.filePath)
        expect(
          Object.values(output.assets).some((file) =>
            file.replace(/\\/g, '/').includes('/node_modules/next/')
          )
        ).toBe(false)
        const executable = await fs.readFile(output.filePath)
        const entryHash = createHash('sha256')
          .update(context.config.outputHashSalt || '')
          .update('file:')
          .update(executable)
          .digest('hex')
        expect(
          output.assetsHashes[
            relative(context.repoRoot, output.filePath).replace(/\\/g, '/')
          ]
        ).toBe(entryHash)
        for (const [destination, file] of Object.entries(output.assets)) {
          expect(output.assetsHashes[destination]).toBe(
            createHash('sha256')
              .update(context.config.outputHashSalt || '')
              .update('file:')
              .update(await fs.readFile(file))
              .digest('hex')
          )
        }
      }

      const nativeOutput = goOutputs.find(
        (output) => output.pathname === '/adapter-base/native/[id]'
      )!
      expect(nativeOutput.sourcePage).toBe('/(group)/native/[id]/route')
      expect(nativeOutput.id).toBe('/native/[id]')
      expect(nativeOutput.config).toEqual({})
      expect(
        context.outputs.appPages.some(
          (output) => output.sourcePage === nativeOutput.sourcePage
        )
      ).toBe(false)

      async function withStandaloneRoute(
        output: AdapterOutput['APP_ROUTE'],
        run: (port: number) => Promise<void>
      ) {
        const directory = await fs.mkdtemp(join(tmpdir(), 'go-adapter-route-'))
        let child: ReturnType<typeof spawn> | undefined
        let closed: Promise<void> | undefined
        try {
          for (const [destination, source] of Object.entries(output.assets)) {
            const file = join(directory, destination)
            await fs.mkdir(dirname(file), { recursive: true })
            await fs.copyFile(source, file)
          }
          const executable = join(
            directory,
            process.platform === 'win32' ? 'user-server.exe' : 'user-server'
          )
          await fs.copyFile(output.filePath, executable)
          await fs.chmod(executable, 0o755)
          const port = await findPort()
          const env: NodeJS.ProcessEnv = {
            ...process.env,
            PORT: String(port),
          }
          delete env.__NEXT_GO_TOKEN
          child = spawn(executable, [], {
            cwd: directory,
            env,
            // Adapter servers must not depend on a parent-owned stdin pipe.
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          closed = new Promise((resolve) =>
            child!.once('close', () => resolve())
          )
          let failure: Error | undefined
          child.once('error', (error) => {
            failure = error
          })
          let stderr = ''
          child.stderr?.on('data', (chunk) => {
            stderr += chunk.toString()
          })
          await retry(async () => {
            if (failure) throw failure
            if (child!.exitCode !== null) {
              throw new Error(`Adapter server exited: ${stderr}`)
            }
            const response = await fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              '/unmatched-readiness'
            )
            expect(response.status).toBe(404)
          })
          await run(port)
        } finally {
          if (child) {
            child.kill()
            await closed
          }
          await fs.rm(directory, { recursive: true, force: true })
        }
      }

      await withStandaloneRoute(nativeOutput, async (port) => {
        const response = await fetchViaHTTP(
          `http://127.0.0.1:${port}`,
          '/adapter-base/native/a%20b?key=one&key=two',
          undefined,
          {
            method: 'POST',
            body: 'adapter request body',
            headers: {
              'x-next-internal-go-token': 'forged',
            },
          }
        )
        expect(response.status).toBe(201)
        expect(response.headers.get('x-handled-by')).toBe('POST')
        expect(await response.json()).toMatchObject({
          id: 'a b',
          method: 'POST',
          query: 'key=one&key=two',
          body: 'adapter request body',
          sibling: 'sibling-v1',
          dependency: 'transitive-v1',
          embedded: 'embedded-v1',
          proxy: '',
          privateMetadata: false,
        })
        expect(response.headers.get('set-cookie')).toContain('first=1')
        expect(response.headers.get('set-cookie')).toContain('second=2')
        await expectParameterParity('/adapter-base/native/[id]', (path) =>
          fetchViaHTTP(`http://127.0.0.1:${port}`, path)
        )
        const options = await fetchViaHTTP(
          `http://127.0.0.1:${port}`,
          '/adapter-base/native/options',
          undefined,
          { method: 'OPTIONS' }
        )
        expect(options.status).toBe(204)
        expect(options.headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST')
        expect(
          (
            await fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              '/adapter-base/native/method',
              undefined,
              { method: 'DELETE' }
            )
          ).status
        ).toBe(405)
        await new Promise<void>((resolve, reject) => {
          const req = request(
            `http://127.0.0.1:${port}/adapter-base/native/stream?stream=1`,
            (res) => {
              res.once('data', (chunk) => {
                try {
                  expect(chunk.toString()).toBe('first')
                  res.destroy()
                  resolve()
                } catch (error) {
                  reject(error)
                }
              })
            }
          )
          req.setTimeout(5000, () => req.destroy(new Error('Stream timed out')))
          req.on('error', reject)
          req.end()
        })
      })
      await withStandaloneRoute(
        goOutputs.find(
          (output) => output.pathname === '/adapter-base/methods'
        )!,
        async (port) => {
          await expectAutomaticMethods((method) =>
            fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              '/adapter-base/methods',
              undefined,
              { method }
            )
          )
        }
      )
      await withStandaloneRoute(
        goOutputs.find(
          (output) => output.pathname === '/adapter-base/explicit-methods'
        )!,
        async (port) => {
          await expectExplicitMethods((method) =>
            fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              '/adapter-base/explicit-methods',
              undefined,
              { method }
            )
          )
        }
      )
      await withStandaloneRoute(
        goOutputs.find(
          (output) => output.pathname === '/adapter-base/catch/[...slug]'
        )!,
        async (port) => {
          const response = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            '/adapter-base/catch/one/two%20three'
          )
          expect(response.status).toBe(200)
          expect(await response.json()).toEqual(['one', 'two three'])
        }
      )

      // Adapters forward the final rewritten URL, including its query and basePath.
      await withStandaloneRoute(nativeOutput, async (port) => {
        const destination =
          '/adapter-base/native/a%2Fb?key=%2f&key=one+two&nxtPid=caller'
        const response = await fetchViaHTTP(
          `http://127.0.0.1:${port}`,
          destination,
          undefined,
          { method: 'POST', body: 'rewritten body' }
        )
        expect(response.status).toBe(201)
        expect(await response.json()).toMatchObject({
          id: 'a/b',
          path: '/adapter-base/native/a%2Fb',
          requestURI: destination,
          query: 'key=%2f&key=one+two&nxtPid=caller',
          body: 'rewritten body',
        })
        expect(
          (await fetchViaHTTP(`http://127.0.0.1:${port}`, '/alias')).status
        ).toBe(404)
      })
      await withStandaloneRoute(
        goOutputs.find(
          (output) => output.pathname === '/adapter-base/catch/[...slug]'
        )!,
        async (port) => {
          const response = await fetchViaHTTP(
            `http://127.0.0.1:${port}`,
            '/adapter-base/catch/one%2Ftwo/three%20four'
          )
          expect(response.status).toBe(200)
          expect(await response.json()).toEqual(['one/two', 'three four'])
          await expectParameterParity('/adapter-base/catch/[...slug]', (path) =>
            fetchViaHTTP(`http://127.0.0.1:${port}`, path)
          )
        }
      )
      await withStandaloneRoute(
        goOutputs.find(
          (output) =>
            output.pathname === '/adapter-base/adapter-optional/[[...slug]]'
        )!,
        async (port) => {
          await expectParameterParity(
            '/adapter-base/adapter-optional/[[...slug]]',
            (path) => fetchViaHTTP(`http://127.0.0.1:${port}`, path)
          )
          for (const [path, params] of [
            ['/adapter-base/adapter-optional', null],
            [
              '/adapter-base/adapter-optional/one%2Ftwo/three%20four',
              ['one/two', 'three four'],
            ],
          ] as const) {
            const response = await fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              `${path}?key=%252f`
            )
            expect(response.status).toBe(200)
            expect(await response.json()).toMatchObject({
              params,
              path,
              requestURI: `${path}?key=%252f`,
              query: 'key=%252f',
            })
          }
        }
      )
      for (const [pathname, escapedPath] of [
        ['/adapter-base/adapter-static', '/adapter-base/adapter-static'],
        [
          '/adapter-base/adapter-special/café a 100%',
          '/adapter-base/adapter-special/caf%C3%A9%20a%20100%25',
        ],
      ]) {
        await withStandaloneRoute(
          goOutputs.find((output) => output.pathname === pathname)!,
          async (port) => {
            const destination = `${escapedPath}?key=%2f&key=one+two`
            const response = await fetchViaHTTP(
              `http://127.0.0.1:${port}`,
              destination
            )
            expect(response.status).toBe(200)
            expect(await response.json()).toMatchObject({
              path: escapedPath,
              requestURI: destination,
              query: 'key=%2f&key=one+two',
            })
          }
        )
      }
    }, 180_000)
  }
})

// @force-gate turbopack
describe('native-route-go in src/app', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // No configured deployment adapter supports Go. This case also moves sources
    // and starts a local server; see README.md for the deploy coverage boundary.
    skipDeployment: true,
    env: { WATCHPACK_POLLING: '50' },
  })
  beforeAll(async () => {
    if (skipped) return
    await fs.mkdir(join(next.testDir, 'src'))
    await next.renameFolder('app', 'src/app')
    await next.renameFolder('pages', 'src/pages')
    await next.renameFile('proxy.ts', 'src/proxy.ts')
    await next.start()
  })
  it('discovers grouped native handlers below src/app', async () => {
    await retry(async () => {
      const response = await next.fetch('/native/source')
      expect(response.status).toBe(201)
      expect(await response.json()).toMatchObject({
        id: 'source',
        sibling: 'sibling-v1',
        proxy: '1',
      })
    }, 30_000)
  })
})

describe('native route diagnostics', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // These assertions invoke local failing builds, which cannot be deployed.
    // See README.md; HTTP adapter behavior is exercised by the start-mode cases.
    skipDeployment: true,
  })
  it('reports Go routes without the experiment before invoking the compiler', async () => {
    const config = await next.readFile('next.config.ts')
    await next.patchFile(
      'next.config.ts',
      config.replace('goRoutes: true', 'goRoutes: false'),
      async () => {
        const result = await next.runCommand(['build', '--turbopack'], {
          env: {
            TURBOPACK_GO: '/missing-go-toolchain',
            IS_TURBOPACK_TEST: '1',
            IS_WEBPACK_TEST: '',
          },
        })
        expect(result.exitCode).not.toBe(0)
        expect(result.cliOutput).toContain(
          'route.go requires experimental.goRoutes: true'
        )
      }
    )
  })
  it('does not require Go or trace its runtime when no Go routes exist', async () => {
    const files = (
      await fs.readdir(join(next.testDir, 'app'), { recursive: true })
    ).filter((file) => file.endsWith('route.go'))
    try {
      for (const file of files) {
        await fs.rename(
          join(next.testDir, 'app', file),
          join(next.testDir, 'app', `${file}.disabled`)
        )
      }
      const result = await next.runCommand(['build', '--turbopack'], {
        env: {
          TURBOPACK_GO: '/missing-go-toolchain',
          IS_TURBOPACK_TEST: '1',
          IS_WEBPACK_TEST: '',
        },
      })
      if (result.exitCode !== 0) throw new Error(result.cliOutput)
      expect(result.exitCode).toBe(0)
      const trace = await next.readJSON('.next/next-server.js.nft.json')
      expect(
        trace.files.some((file: string) =>
          /native-route(?:\.external|-proxy)\.js$/.test(
            file.replace(/\\/g, '/')
          )
        )
      ).toBe(false)
    } finally {
      for (const file of files) {
        await fs.rename(
          join(next.testDir, 'app', `${file}.disabled`),
          join(next.testDir, 'app', file)
        )
      }
    }
  })
  it('reports unsupported native handlers when building with Webpack', async () => {
    const result = await next.runCommand(['build', '--webpack'], {
      env: {
        IS_TURBOPACK_TEST: '',
        IS_WEBPACK_TEST: '1',
        NEXT_RSPACK: '',
        NEXT_TEST_USE_RSPACK: '',
      },
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout + result.stderr).toContain(
      'route.go requires Turbopack'
    )
  })
  it('rejects a named handler with an incompatible net/http signature', async () => {
    const path = 'app/methods/route.go'
    const source = await next.readFile(path)
    await next.patchFile(
      path,
      source.replace(
        'func GET(w http.ResponseWriter, r *http.Request)',
        'func GET(w http.ResponseWriter)'
      ),
      async () => {
        const result = await next.runCommand(['build', '--turbopack'], {
          env: {
            IS_WEBPACK_TEST: '',
            IS_TURBOPACK_TEST: '1',
            NEXT_RSPACK: '',
            NEXT_TEST_USE_RSPACK: '',
          },
        })
        expect(result.exitCode).not.toBe(0)
        const output = result.stdout + result.stderr
        expect(output).toContain('cannot use GET')
        expect(output).toContain('http.HandlerFunc')
      }
    )
  })
  it('diagnoses conflicting Go and TS handlers', async () => {
    await next.patchFile(
      'app/(group)/native/[id]/route.ts',
      'export function GET() { return new Response("conflict") }'
    )
    const result = await next.runCommand(['build', '--turbopack'], {
      env: {
        IS_WEBPACK_TEST: '',
        IS_TURBOPACK_TEST: '1',
        NEXT_RSPACK: '',
        NEXT_TEST_USE_RSPACK: '',
      },
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout + result.stderr).toContain(
      'Conflicting App Router handlers'
    )
  })
})
