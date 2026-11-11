import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { retry } from 'next-test-utils'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

// A local module proxy exercises ordinary downloaded dependencies without a
// published SDK release or relaxing the compiler's replacement restrictions.
function prepareSDK(next: ReturnType<typeof nextTestSetup>['next']) {
  let cache: string
  beforeAll(async () => {
    cache = await fs.mkdtemp(join(tmpdir(), 'next-go-config-module-'))
    const proxy = join(cache, 'proxy')
    const sdk = join(next.testDir, 'node_modules/next/go')
    await exec(
      process.env.TURBOPACK_GO || 'go',
      ['run', join(next.testDir, 'tools/module-proxy/main.go'), sdk, proxy],
      { env: { ...process.env, GO111MODULE: 'off', GOWORK: 'off' } }
    )
    next.env.GOMODCACHE = join(cache, 'modules')
    await exec(
      process.env.TURBOPACK_GO || 'go',
      ['mod', 'download', 'github.com/vercel/next.js/packages/next/go'],
      {
        cwd: next.testDir,
        env: {
          ...process.env,
          GOWORK: 'off',
          GOSUMDB: 'off',
          GOPROXY: pathToFileURL(proxy).href,
          GOMODCACHE: next.env.GOMODCACHE,
          GOFLAGS: '-modcacherw',
        },
      }
    )
  })
  afterAll(async () => {
    if (cache) await fs.rm(cache, { recursive: true, force: true })
  })
}

// Hosted Go support requires the companion adapter/builder releases.
// @force-gate turbopack && !deploy
describe('static Go config', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  prepareSDK(next)
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

  if (isNextDev) {
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
        })
      } finally {
        await next.patchFile('proxy.go', source)
      }
    })
  }

  if (isNextStart) {
    it('emits per-entry duration, regions and matchers into manifests and adapter output', async () => {
      const manifest = await next.readJSON(
        '.next/server/functions-config-manifest.json'
      )
      expect(manifest.functions['/configured']).toMatchObject({
        maxDuration: 17,
        regions: ['sfo1', 'iad1'],
      })
      expect(manifest.functions['/_middleware']).toMatchObject({
        maxDuration: 11,
        regions: ['iad1'],
        matchers: [
          expect.objectContaining({ originalSource: '/configured' }),
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
      await next.build()
      const output = await next.readJSON('go-config-output.json')
      expect(output.middleware).toMatchObject({
        runtime: 'go',
        config: {
          maxDuration: 11,
          preferredRegion: ['iad1'],
          matchers: [
            expect.objectContaining({ source: '/configured' }),
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
        config: { maxDuration: 17, preferredRegion: ['sfo1', 'iad1'] },
      })
    })
  }
})

// These assertions intentionally fail builds before any app can be deployed.
// @force-gate turbopack && start
describe('static Go config diagnostics', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })
  prepareSDK(next)
  it('checks the SDK parser against static and computed syntax', async () => {
    await expect(
      exec(
        process.env.TURBOPACK_GO || 'go',
        ['test', './internal/configparser'],
        {
          cwd: join(next.testDir, 'node_modules/next/go'),
          env: { ...process.env, GOWORK: 'off' },
        }
      )
    ).resolves.toHaveProperty('stdout')
  })
  const cases = [
    {
      file: 'proxy.go',
      from: /MaxDuration:\s+11/,
      to: 'MaxDuration: duration()',
      error: 'positive integer literal',
    },
    {
      file: 'proxy.go',
      from: 'Source: "/configured"',
      to: 'Source: os.Getenv("PROXY_PATH")',
      error: 'static string literals',
    },
    {
      file: 'app/configured/route.go',
      from: /MaxDuration:\s+17/,
      to: 'MaxDuration: 10 + 7',
      error: 'positive integer literal',
    },
    {
      file: 'app/configured/route.go',
      from: 'var Config = framework.RouteConfig{',
      to: 'var Config = makeConfig(); var unused = framework.RouteConfig{',
      error: 'static next.RouteConfig literal',
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
        if (to.includes('duration()'))
          patched += '\nfunc duration() int { return 11 }\n'
        if (to.includes('os.Getenv'))
          patched = patched.replace('"net/http"', '"net/http"\n"os"')
        if (to.includes('makeConfig()'))
          patched +=
            '\nfunc makeConfig() framework.RouteConfig { return framework.RouteConfig{} }\n'
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
