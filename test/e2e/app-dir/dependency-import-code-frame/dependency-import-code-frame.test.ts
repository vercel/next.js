import { isNextDev, nextTestSetup } from 'e2e-utils'
import { getRedboxSource, openRedbox, retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// This route intentionally fails prerendering. A deployment cannot expose the
// local build output or dev overlay.
// @force-gate !deploy
describe('dependency-import-code-frame', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: { 'external-time': 'file:./packages/external-time' },
  })

  function expectImportFrame(output: string) {
    expect(output).toMatch(/>\s*6\s*\|\s*<BlockingWidget \/>/)
    expect(output).toMatch(
      /Imported here:\s*>\s*1\s*\|\s*import \{ BlockingWidget \} from 'external-time'/
    )
    expect(output).not.toContain('node_modules/external-time/index.js')
  }

  if (isNextDev) {
    it('shows the import in the application code frame', async () => {
      await next.start()
      const browser = await next.browser('/')
      await openRedbox(browser)
      await retry(async () =>
        expectImportFrame((await getRedboxSource(browser)) ?? '')
      )
    })
  } else {
    it('shows the same import in debug-prerender output', async () => {
      const { exitCode, cliOutput } = await next.build({
        args: ['--debug-prerender'],
      })
      expect(exitCode).toBe(1)
      expectImportFrame(stripAnsi(cliOutput).replace(/\\/g, '/'))
    })
  }
})
