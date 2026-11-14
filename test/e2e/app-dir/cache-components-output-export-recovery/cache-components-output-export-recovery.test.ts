import { join } from 'node:path'
import { nextTestSetup } from 'e2e-utils'
import * as cheerio from 'cheerio'

const modes = [
  { name: 'ordinary auto server', output: undefined, navigation: false },
  { name: 'static export', output: 'export' as const, navigation: false },
  { name: 'authored navigation server', output: undefined, navigation: true },
]

// These assertions inspect local production prerender output and recovery.
// @force-gate start
describe.each([false, true])(
  'HTTP recovery (partialPrefetching: %s)',
  (partialPrefetching) => {
    describe.each(modes)('$name', (mode) => {
      function setupRecovery(files: string) {
        const { next } = nextTestSetup({
          files,
          skipStart: true,
        })

        beforeAll(async () => {
          await next.patchFile(
            'next.config.ts',
            `export default ${JSON.stringify({
              cacheComponents: true,
              partialPrefetching,
              output: mode.output,
            })}`
          )
          if (mode.navigation) {
            const root = await next.readFile('app/layout.tsx')
            await next.patchFile(
              'app/layout.tsx',
              root + '\nexport const ensureStatic = "navigation"\n'
            )
          }
          const result = await next.build({
            args: ['--experimental-build-mode', 'compile', '--debug-prerender'],
          })
          if (result.exitCode !== 0) {
            throw new Error(
              'Failed to compile HTTP recovery fixtures:\n' + result.cliOutput
            )
          }
        })
        return next
      }

      describe('complete Flight', () => {
        const next = setupRecovery(join(__dirname, 'fixtures', 'complete'))

        it('allows complete Flight in parallel notFound recovery', async () => {
          const result = await next.build({
            args: [
              '--experimental-build-mode',
              'generate',
              '--debug-prerender',
              '--debug-build-paths',
              'app/recover-static/page.tsx',
            ],
          })
          expect(result.cliOutput).not.toContain('did not match any files')
          expect(result.exitCode).toBe(0)
          const meta = await next.readJSON(
            '.next/server/app/recover-static.meta'
          )
          expect(meta.status).toBe(404)
          expect(meta.postponed).toBeUndefined()
          if (mode.output === 'export') {
            expect(await next.readFile('out/recover-static.html')).toContain(
              'Recovered complete 404'
            )
          } else {
            await next.start({ skipBuild: true })
            try {
              const response = await next.fetch('/recover-static')
              expect(response.status).toBe(404)
              expect(await response.text()).toContain('Recovered complete 404')
            } finally {
              await next.stop()
            }
          }
        })
      })

      describe('runtime Flight', () => {
        const next = setupRecovery(__dirname)

        it.each([
          { pathname: '/recover', status: 404, text: 'Recovered 404' },
          { pathname: '/recover-redirect', status: 307, text: undefined },
          { pathname: '/recover-head', status: 404, text: 'Recovered head' },
        ])(
          'qualifies the original Flight payload for $pathname',
          async ({ pathname, status, text }) => {
            const result = await next.build({
              args: [
                '--experimental-build-mode',
                'generate',
                '--debug-prerender',
                '--debug-build-paths',
                `app${pathname}/page.tsx`,
              ],
            })
            expect(result.cliOutput).not.toContain('did not match any files')
            if (mode.output === 'export' || mode.navigation) {
              expect(result.exitCode).toBe(1)
              expect(result.cliOutput).toContain(`Route "${pathname}"`)
              expect(result.cliOutput).toMatch(
                /data that is not available during a static prerender|data on a route that must be fully static|data in `generate(?:Metadata|Viewport)\(\)` on a route that must be fully static/
              )
              if (mode.output === 'export')
                expect(result.cliOutput).toContain('output: "export"')
            } else {
              expect(result.exitCode).toBe(0)
              const meta = await next.readJSON(
                `.next/server/app${pathname}.meta`
              )
              expect(meta.status).toBe(status)
              expect(meta.postponed).toBeDefined()
              await next.start({ skipBuild: true })
              try {
                const response = await next.fetch(pathname, {
                  redirect: 'manual',
                  headers: {
                    cookie: 'cc-output-export-recovery-theme=#c0ffee',
                  },
                })
                expect(response.status).toBe(status)
                const html = await response.text()
                if (text) expect(html).toContain(text)
                if (pathname === '/recover-head') {
                  const flightResponse = await next.fetch(pathname, {
                    headers: {
                      rsc: '1',
                      cookie: 'cc-output-export-recovery-theme=#c0ffee',
                    },
                  })
                  expect(flightResponse.headers.get('content-type')).toContain(
                    'text/x-component'
                  )
                  const flight = await flightResponse.text()
                  expect(flight).toContain('Recovered head')
                  expect(flight).toContain('Original metadata')
                  expect(flight).toContain('#c0ffee')
                  expect(flight).not.toContain('#a1b2c3')
                }
                if (status === 307)
                  expect(response.headers.get('location')).toBe('/')
              } finally {
                await next.stop()
              }
            }
          }
        )
      })
    })
  }
)

// global-not-found replaces the root layout, so its output is qualified separately.
// @force-gate start
describe.each([false, true])(
  'global 404 qualification (partialPrefetching: %s)',
  (partialPrefetching) => {
    describe.each([false, true])('export: %s', (isExport) => {
      const { next } = nextTestSetup({
        files: join(__dirname, 'fixtures/global'),
        skipStart: true,
        nextConfig: {
          cacheComponents: true,
          partialPrefetching,
          output: isExport ? 'export' : undefined,
          experimental: { globalNotFound: true },
        },
      })

      it('qualifies global output independently of the root navigation assertion', async () => {
        const result = await next.build({ args: ['--debug-prerender'] })
        if (isExport) {
          expect(result.exitCode).toBe(1)
          expect(result.cliOutput).toContain('output: "export"')
          expect(result.cliOutput).toContain('must be fully static')
        } else {
          expect(result.exitCode).toBe(0)
          await next.start({ skipBuild: true })
          try {
            const response = await next.fetch('/missing')
            expect(response.status).toBe(404)
            const $ = cheerio.load(await response.text())
            expect($('p').text()).toContain('Global 404: missing')
          } finally {
            await next.stop()
          }
        }
      })
    })
  }
)
