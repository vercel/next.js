import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { utimes } from 'fs/promises'
import path from 'path'

// A loader in this fixture caches its output by the resource's mtime, like
// `@tailwindcss/turbopack`. If the loader is ever invoked with the previous
// content of the file after an edit, it caches that stale output under the new
// mtime and the served CSS stays one edit behind.
describe('loader-stale-resource-input', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const LOG_FILE = '.next/loader-invocations.log'

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
    Array<{ source: string; disk: string; mtimeMs: number; stale: boolean }>
  > {
    const log = await next.readFile(LOG_FILE)
    return log
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  }

  it('runs loaders with the current file content after each edit', async () => {
    expect(await getServedCss()).toContain('.rev-initial')

    for (let i = 1; i <= 3; i++) {
      const rule = `.rev-${i}`
      await next.patchFile(
        'app/globals.css',
        `${rule} {\n  color: rgb(${i}, ${i}, ${i});\n}\n`
      )

      // Wait until the loader has run for the edited file.
      await retry(async () => {
        await getServedCss()
        const invocations = await getInvocations()
        expect(
          invocations.some((invocation) => invocation.disk.includes(rule))
        ).toBe(true)
      })

      // No invocation may have been given content that differs from the file
      // on disk.
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

  it('does not re-run the loader when an unrelated file changes', async () => {
    await getServedCss()
    const before = (await getInvocations()).length

    await next.patchFile('app/page.js', (content = '') =>
      content.replace('hello world', 'hello unrelated')
    )
    await retry(async () => {
      expect((await next.render$('/'))('p').first().text()).toBe(
        'hello unrelated'
      )
    })
    await getServedCss()

    expect((await getInvocations()).length).toBe(before)
  })

  it('still invalidates the loader when a reported dependency changes', async () => {
    expect(await getServedCss()).toContain('dep-initial')

    await next.patchFile('app/dep.txt', 'dep-updated\n')

    await retry(async () => {
      expect(await getServedCss()).toContain('dep-updated')
    })
  })

  it('still invalidates the loader on metadata-only changes when it stats the resource', async () => {
    const readMtime = async () =>
      Number((await next.render$('/'))('#mtime').text())
    const initial = await readMtime()
    const modified = new Date('2000-01-01T00:00:00Z')

    await utimes(
      path.join(next.testDir, 'app/resource.selfstat'),
      modified,
      modified
    )

    await retry(async () => {
      expect(await readMtime()).toBe(modified.getTime())
    })
    expect(initial).not.toBe(modified.getTime())
  })
})
