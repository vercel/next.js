import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { request } from 'http'
import { promises as fs } from 'fs'
import { join } from 'path'

// @force-gate turbopack
describe('native-route-go', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    // Native executables currently support self-hosted next start only.
    skipDeployment: true,
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
    expect(response.headers.get('x-native-route')).toBe('yes')
    expect(response.headers.get('set-cookie')).toContain('first=1')
    expect(response.headers.get('set-cookie')).toContain('second=2')
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
    const head = await next.fetch('/native/head', { method: 'HEAD' })
    expect(head.status).toBe(201)
    expect(await head.text()).toBe('')
    const options = await next.fetch('/native/options', { method: 'OPTIONS' })
    expect(options.status).toBe(204)
    expect(options.headers.get('allow')).toBe('GET, HEAD, POST, OPTIONS')
    expect(
      (await next.fetch('/native/method', { method: 'DELETE' })).status
    ).toBe(405)
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
    const response = await next.fetch('/native/trusted', {
      headers: { 'x-next-go-token': 'forged', 'x-next-go-params': 'forged' },
    })
    expect((await response.json()).id).toBe('trusted')
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
        'package main\nfunc sibling() string { return "sibling-immediate" }\n'
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
        original.replace('func Handle', 'invalid syntax\nfunc Handle')
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
    it('caches startup errors and repairs them after an edit', async () => {
      const path = 'app/startup/route.go'
      const source =
        'package main\nimport "net/http"\nvar Methods = []string{"GET"}\nfunc init() { panic("startup-fixture-error") }\nfunc Handle(w http.ResponseWriter, r *http.Request) { w.Write([]byte("recovered")) }\n'
      await next.patchFile(path, source)
      expect((await next.fetch('/startup')).status).toBe(500)
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
      await retry(async () => {
        expect((await next.fetch('/added')).status).toBe(200)
      })
      await next.renameFolder('app/added', 'app/renamed')
      await retry(async () => {
        expect((await next.fetch('/added')).status).toBe(404)
        expect((await next.fetch('/renamed')).status).toBe(200)
      })
      await next.deleteFile('app/renamed/route.go')
      await retry(async () => {
        expect((await next.fetch('/renamed')).status).toBe(404)
      })
    })
  }
  if (isNextStart) {
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
  }
})

// @force-gate turbopack
describe('native-route-go in src/app', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // Native executables currently support self-hosted next start only.
    skipDeployment: true,
  })
  beforeAll(async () => {
    await fs.mkdir(join(next.testDir, 'src'))
    await next.renameFolder('app', 'src/app')
    await next.renameFolder('pages', 'src/pages')
    await next.renameFile('proxy.ts', 'src/proxy.ts')
    await next.start()
  })
  it('discovers grouped native handlers below src/app', async () => {
    const response = await next.fetch('/native/source')
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      id: 'source',
      sibling: 'sibling-v1',
      proxy: '1',
    })
  })
})

describe('native route diagnostics', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // Native executables currently support self-hosted next start only.
    skipDeployment: true,
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
