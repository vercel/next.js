import { isNextDev, nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  getRedboxSource,
  openRedbox,
  retry,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// These routes intentionally fail prerendering. A deployment cannot expose the
// local build output or dev overlay.
// @force-gate !deploy
describe('dependency-import-code-frame', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: { 'external-time': 'file:./packages/external-time' },
  })

  const cases = [
    ['/', 'new Date()', 'BlockingWidget'],
    ['/timestamp', 'Date.now()', 'TimestampWidget'],
    ['/random', 'Math.random()', 'RandomWidget'],
    ['/web-crypto', 'crypto.getRandomValues()', 'WebCryptoWidget'],
    ['/node-crypto', "require('node:crypto').randomUUID()", 'NodeCryptoWidget'],
  ] as const

  function expectImportFrame(output: string, widget: string) {
    const rows = output.split('\n')
    const imported = rows.findIndex((row) =>
      row.includes(`import { ${widget} } from 'external-time'`)
    )
    const usage = rows.findIndex(
      (row) => /^\s*>\s*\d+\s*\|/.test(row) && row.includes(`<${widget} />`)
    )
    expect(imported).toBeGreaterThanOrEqual(0)
    expect(usage).toBeGreaterThan(imported)
    expect(rows[usage + 1]).toMatch(/\|\s*\^/)
    expect(output).not.toContain('node_modules/external-time/index.js')
  }

  if (isNextDev) {
    beforeAll(async () => {
      await next.start()
    })

    it.each(cases)(
      'shows the dependency import on %s for %s in the dev overlay',
      async (route, expression, widget) => {
        const browser = await next.browser(route)
        await openRedbox(browser)
        await retry(async () => {
          expect(await getRedboxDescription(browser)).toContain(expression)
          expectImportFrame((await getRedboxSource(browser)) ?? '', widget)
        })
      }
    )
  } else {
    it('shows the dependency import for each sync IO error in debug-prerender output', async () => {
      const { exitCode, cliOutput } = await next.build({
        args: ['--debug-prerender'],
      })
      expect(exitCode).toBe(1)
      const errors = stripAnsi(cliOutput)
        .replace(/\\/g, '/')
        .split('Error: Route "')
      for (const [route, expression, widget] of cases) {
        const error = errors.find(
          (entry) =>
            entry.startsWith(`${route}":`) &&
            entry.split('\n', 1)[0].includes(expression)
        )
        expect(error).toBeDefined()
        expectImportFrame(error!, widget)
      }
    })
  }
})
