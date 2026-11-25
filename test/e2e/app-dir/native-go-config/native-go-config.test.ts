import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { retry } from 'next-test-utils'

// Hosted Go support requires the companion adapter/builder releases.
// @force-gate turbopack && !deploy
describe('static Go config', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
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
    it.each([
      {
        failure: 'static Go Config analysis',
        from: 'Source: "/configured"',
        to: 'Source: configSource()',
        extra: '\nfunc configSource() string { return "/configured" }\n',
        error: 'static string literals',
      },
      {
        failure: 'Go compilation',
        from: 'proxy.Next(w)',
        to: 'proxy.Next(w, undefinedOption)',
        extra: '',
        error: 'undefined: undefinedOption',
      },
      {
        failure: 'expanded matcher validation',
        from: 'Source: "/configured"',
        // The literal is valid, but the expanded matcher exceeds 4096 characters.
        to: `Source: "${'/' + 'a'.repeat(4089)}"`,
        extra: '',
        error: 'exceeds max built length of 4096',
      },
    ])(
      'fails closed on initial $failure and restrictive → invalid → valid edits',
      async ({ from, to, extra, error }) => {
        await next.stop()
        await next.clean()
        const source = await next.readFile('proxy.go')
        const invalidSource = source.replace(from, to) + extra
        const expectBlocked = async () => {
          await retry(async () => {
            // Both paths are outside the restrictive matcher used below. Native
            // routes must not bypass the failed proxy via their fast path.
            for (const path of ['/configured', '/']) {
              const response = await next.fetch(path)
              expect(response.status).toBe(500)
              expect(await response.text()).not.toBe('configured route')
            }
          }, 60_000)
          expect(next.cliOutput).toContain(error)
        }
        try {
          // No descriptor exists when the first proxy compile fails.
          await next.patchFile('proxy.go', invalidSource)
          await next.start()
          await expectBlocked()

          await next.patchFile(
            'proxy.go',
            source.replace('Source: "/configured"', 'Source: "/not-configured"')
          )
          await retry(async () => {
            const response = await next.fetch('/configured')
            expect(response.status).toBe(200)
            expect(await response.text()).toBe('configured route')
            expect(response.headers.get('x-static-go-config')).toBeNull()
          }, 60_000)

          // A previous descriptor now exists, but it must not keep its matchers
          // when a new compile fails before publishing a replacement.
          await next.patchFile('proxy.go', invalidSource)
          await expectBlocked()
        } finally {
          await next.patchFile('proxy.go', source)
        }
        await retry(async () => {
          const response = await next.fetch('/configured')
          expect(response.status).toBe(200)
          expect(await response.text()).toBe('configured route')
          expect(response.headers.get('x-static-go-config')).toBe('matched')
          expect(
            (await next.fetch('/')).headers.get('x-static-go-config')
          ).toBeNull()
        }, 60_000)
      },
      360_000
    )

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
        }, 60_000)
      } finally {
        await next.patchFile('proxy.go', source)
      }
    }, 180_000)

    it('fails requests instead of skipping the proxy while its Config is invalid', async () => {
      // Go accepts the literal; Next.js matcher validation rejects it, which
      // `next build` reports as an error. Dev must not serve the routes the
      // proxy guards without running it.
      const source = await next.readFile('proxy.go')
      try {
        await next.patchFile(
          'proxy.go',
          source.replace('Source: "/configured"', 'Source: "invalid"')
        )
        await retry(async () => {
          const response = await next.fetch('/configured')
          expect(response.status).toBe(500)
          expect(await response.text()).not.toBe('configured route')
        }, 60_000)
        expect(next.cliOutput).toContain('must start with /')
      } finally {
        await next.patchFile('proxy.go', source)
      }
      await retry(async () => {
        const response = await next.fetch('/configured')
        expect(await response.text()).toBe('configured route')
        expect(response.headers.get('x-static-go-config')).toBe('matched')
      }, 60_000)
    }, 240_000)
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
  const cases = [
    {
      file: 'proxy.go',
      from: 'var Config = proxy.Config{',
      to: 'var Config = proxy.Config{MaxDuration: 11,',
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
      file: 'app/configured/route.go',
      from: 'const MaxDuration = 17',
      to: 'const MaxDuration time.Duration = 17',
      error: 'number of seconds',
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
        if (to.includes('time.Duration'))
          patched = patched.replace(
            'import "net/http"',
            'import (\n"net/http"\n"time"\n)'
          )
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
