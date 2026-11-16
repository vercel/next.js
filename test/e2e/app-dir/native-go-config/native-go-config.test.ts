import { nextTestSetup } from 'e2e-utils'
import { join, relative, sep } from 'path'
import { retry } from 'next-test-utils'
import { realpathSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

// The SDK ships in the installed next package. Map it the way next dev does:
// a directory replacement to its real location, with nothing downloaded.
function mapSDK(next: ReturnType<typeof nextTestSetup>['next']) {
  beforeAll(async () => {
    const dir = realpathSync(next.testDir)
    const sdk = relative(dir, realpathSync(join(dir, 'node_modules/next/go')))
    await exec(
      process.env.TURBOPACK_GO || 'go',
      ['mod', 'edit', `-replace=next/go=./${sdk.split(sep).join('/')}`],
      { cwd: dir, env: { ...process.env, GOWORK: 'off', GOFLAGS: '' } }
    )
  })
}

// Hosted Go support requires the companion adapter/builder releases.
// @force-gate turbopack && !deploy
describe('static Go config', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  mapSDK(next)
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
        config: { maxDuration: 17 },
      })
    })
  }
})

// These assertions intentionally fail builds before any app can be deployed.
// @force-gate turbopack && start
describe('static Go config diagnostics', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })
  mapSDK(next)
  const cases = [
    {
      file: 'proxy.go',
      from: 'var Config = next.ProxyConfig{',
      to: 'var Config = next.ProxyConfig{MaxDuration: 11,',
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
