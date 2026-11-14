import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { retry } from 'next-test-utils'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { pathToFileURL } from 'url'

const runGo = promisify(execFile)

// @force-gate turbopack
describe('native-route-browser-assets', () => {
  const sdkCache = join(tmpdir(), `next-go-browser-${randomUUID()}`)
  const go = process.env.TURBOPACK_GO || 'go'
  const goEnv = {
    ...process.env,
    GOENV: 'off',
    GOTOOLCHAIN: 'local',
    GOWORK: 'off',
    GOSUMDB: 'off',
    GOMODCACHE: join(sdkCache, 'modules'),
    GOFLAGS: '-modcacherw',
  }

  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
      'go.mod': new FileRef(join(__dirname, 'go.mod')),
      'sdk-source': new FileRef(
        join(__dirname, '../../../../packages/next-go')
      ),
      'prepare-sdk.go': new FileRef(join(__dirname, 'prepare-sdk.go')),
    },
    // The deploy harness has no Go adapter; see the fixture README.
    skipDeployment: true,
    skipStart: true,
    env: { WATCHPACK_POLLING: '50', GOMODCACHE: goEnv.GOMODCACHE },
  })

  beforeAll(async () => {
    await fs.mkdir(sdkCache, { recursive: true })
    const proxy = join(sdkCache, 'proxy')
    await runGo(
      go,
      [
        'run',
        join(next.testDir, 'prepare-sdk.go'),
        join(next.testDir, 'sdk-source'),
        proxy,
      ],
      { env: { ...goEnv, GO111MODULE: 'off' } }
    )
    // Populate an isolated cache through Go's real file-proxy protocol. The route
    // build runs with networking disabled, using the user's ordinary module map.
    await runGo(go, ['mod', 'download', 'next/go'], {
      cwd: next.testDir,
      env: { ...goEnv, GOPROXY: pathToFileURL(proxy).href },
    })
    await next.start()
  })

  afterAll(async () => {
    await fs.rm(sdkCache, { recursive: true, force: true })
  })

  it('resolves the short import through ordinary Go tooling', async () => {
    const { stdout } = await runGo(
      go,
      ['list', '-mod=readonly', '-f', '{{.ImportPath}}', 'next/go/assets'],
      {
        cwd: next.testDir,
        env: { ...goEnv, GOPROXY: 'off' },
      }
    )
    expect(stdout.trim()).toBe('next/go/assets')
  })

  it('discovers and executes the default assets package import', async () => {
    const browser = await next.browser('/browser-default')
    await retry(async () => {
      expect(await browser.eval('document.body.dataset.optional')).toBe('built')
    })
    await browser.close()
  })

  it('renders imported styles, ordered scripts, shared resources and lazy imports', async () => {
    const $ = await next.render$('/browser')
    const scripts = $('script[src]')
      .map((_, element) => $(element).attr('src'))
      .get()
    const styles = $('link[rel=stylesheet]')
      .map((_, element) => $(element).attr('href'))
      .get()
    expect(scripts.length).toBeGreaterThan(0)
    expect(styles.length).toBeGreaterThan(0)
    expect(new Set(scripts).size).toBe(scripts.length)
    expect(new Set(styles).size).toBe(styles.length)
    for (const url of [...scripts, ...styles]) {
      expect(url).toContain('/_next/')
      expect((await next.fetch(url)).status).toBe(200)
    }
    const browser = await next.browser('/browser')
    await retry(async () => {
      expect(await browser.elementByCss('#message').text()).toBe('browser-v1')
    }).catch(async (error) => {
      console.log(await browser.log())
      throw error
    })
    expect(await browser.elementByCss('#navigation').text()).toBe(
      'navigation: browser-v1'
    )
    expect(await browser.elementByCss('#message').getComputedCss('color')).toBe(
      'rgb(12, 34, 56)'
    )
    expect(
      await browser.eval('document.querySelector("#lazy-result").textContent')
    ).toBe('')
    const initialScripts: string[] = await browser.eval(`
      performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => new URL(name).pathname.endsWith('.js'))
    `)
    await browser.elementByCss('#lazy').click()
    await retry(async () => {
      expect(await browser.elementByCss('#lazy-result').text()).toBe(
        'lazy-loaded'
      )
    })
    const loadedScripts: string[] = await browser.eval(`
      performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => new URL(name).pathname.endsWith('.js'))
    `)
    expect(loadedScripts.some((url) => !initialScripts.includes(url))).toBe(
      true
    )
    await browser.close()
  })

  it('builds declared entries that the handler does not normally render', async () => {
    const normal = await next.render('/browser')
    const optional = await next.render$('/browser?optional')
    const urls = optional('script[src]')
      .map((_, element) => optional(element).attr('src'))
      .get()
    expect(urls.some((url) => !normal.includes(url))).toBe(true)
    for (const url of urls) {
      expect((await next.fetch(url)).status).toBe(200)
    }
  })

  it('discards client-supplied manifest metadata', async () => {
    const response = await next.fetch('/browser', {
      headers: { 'x-next-internal-go-assets': 'attacker-controlled' },
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('/_next/')
  })

  // @force-gate dev
  it('updates JS and CSS dependencies without recompiling or restarting Go', async () => {
    const before = await next.fetch('/browser')
    const pid = before.headers.get('x-go-pid')
    const browser = await next.browser('/browser')
    try {
      await next.patchFile(
        'app/browser/shared.ts',
        "export const message = 'browser-v2'"
      )
      await retry(async () => {
        expect(await browser.elementByCss('#message').text()).toBe('browser-v2')
        expect((await next.fetch('/browser')).headers.get('x-go-pid')).toBe(pid)
      })
      await next.patchFile(
        'app/browser/styles.css',
        '#message { color: rgb(65, 43, 21); }'
      )
      await retry(async () => {
        expect(
          await browser.elementByCss('#message').getComputedCss('color')
        ).toBe('rgb(65, 43, 21)')
        expect((await next.fetch('/browser')).headers.get('x-go-pid')).toBe(pid)
      })
    } finally {
      await next.patchFile(
        'app/browser/shared.ts',
        "export const message = 'browser-v1'"
      )
      await next.patchFile(
        'app/browser/styles.css',
        '#message { color: rgb(12, 34, 56); }'
      )
      await browser.close()
    }
  })

  // @force-gate dev
  it('reports browser compilation failures and recovers after a dependency is fixed', async () => {
    const client = 'app/browser/client.ts'
    const original = await next.readFile(client)
    try {
      await next.patchFile(client, 'import "./missing-browser-dependency"')
      await retry(async () => {
        expect((await next.fetch('/browser')).status).toBe(500)
        expect(next.cliOutput).toContain('missing-browser-dependency')
        expect(next.cliOutput).toContain('client.ts')
      })
    } finally {
      await next.patchFile(client, original)
    }
    await retry(async () =>
      expect((await next.fetch('/browser')).status).toBe(200)
    )
  })

  // @force-gate dev
  it('reports invalid declarations and unresolved entries at their Go source position', async () => {
    const route = 'app/browser/route.go'
    const original = await next.readFile(route)
    try {
      for (const [declaration, expected] of [
        ['web.Browser("app/browser/missing.ts")', 'does not exist'],
        ['web.Browser(string("app/browser/client.ts"))', 'string literal'],
        [
          'func() web.Entry { return web.Browser("app/browser/client.ts") }()',
          'direct package-level',
        ],
      ]) {
        await next.patchFile(
          route,
          original.replace('web.Browser("app/browser/client.ts")', declaration)
        )
        await retry(async () => {
          expect((await next.fetch('/browser')).status).toBe(500)
          expect(next.cliOutput).toContain(expected)
          expect(next.cliOutput).toMatch(/route.go:\d+:\d+/)
        })
      }
    } finally {
      await next.patchFile(route, original)
    }
    await retry(async () =>
      expect((await next.fetch('/browser')).status).toBe(200)
    )
  })

  // @force-gate start
  it('publishes a relocatable manifest beside the native executable', async () => {
    const descriptor = JSON.parse(
      await next.readFile('.next/server/app/browser/route.native.json')
    )
    const manifest = JSON.parse(
      await next.readFile(`.next/server/${descriptor.executable}.assets.json`)
    )
    expect(manifest).toEqual(descriptor.assets)
    expect(Object.keys(manifest)).toEqual([
      'app/browser/client.ts',
      'app/browser/navigation.ts',
      'app/browser/optional.ts',
    ])
  })
})
