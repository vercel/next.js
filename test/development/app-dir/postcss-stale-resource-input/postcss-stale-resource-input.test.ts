import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The PostCSS plugin in this fixture reports the input file as a dependency
// and caches its output by the file's mtime. If PostCSS is ever run with the
// previous content of the file after an edit, the plugin caches that stale
// output under the new mtime and the served CSS stays one edit behind.
// Webpack rejects PostCSS plugins passed as functions, so this only runs with
// Turbopack.
// @force-gate turbopack
describe('postcss-stale-resource-input', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const LOG_FILE = '.next/postcss-invocations.log'

  async function getServedCss() {
    const $ = await next.render$('/')
    const hrefs = $('link[rel="stylesheet"]')
      .map((_, el) => $(el).attr('href'))
      .get()
    const contents = await Promise.all(
      hrefs.map(async (href) => (await next.fetch(href)).text())
    )
    return contents.join('\n')
  }

  async function getInvocations(): Promise<
    Array<{ source: string; disk: string; stale: boolean }>
  > {
    const log = await next.readFile(LOG_FILE)
    return log
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  }

  it('runs PostCSS with the current file content after each edit', async () => {
    expect(await getServedCss()).toContain('.rev-initial')

    for (let i = 1; i <= 3; i++) {
      const rule = `.rev-${i}`
      await next.patchFile(
        'app/globals.css',
        `${rule} {\n  color: rgb(${i}, ${i}, ${i});\n}\n`
      )

      // Wait until PostCSS has run for the edited file.
      await retry(async () => {
        await getServedCss()
        const invocations = await getInvocations()
        expect(
          invocations.some((invocation) => invocation.disk.includes(rule))
        ).toBe(true)
      })

      // No run may have been given content that differs from the file on
      // disk.
      expect(
        (await getInvocations()).filter((invocation) => invocation.stale)
      ).toEqual([])

      await retry(async () => {
        const css = await getServedCss()
        expect(css).toContain(rule)
        expect(css).not.toContain(i === 1 ? '.rev-initial' : `.rev-${i - 1}`)
      })
    }
  })
})
