import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { listClientChunks, retry } from 'next-test-utils'

describe('pages-browser-chunks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let sources: string[] = []

  beforeAll(async () => {
    const distDir = join(next.testDir, '.next')
    const chunks = await listClientChunks(distDir)
    const sourcemaps = await Promise.all(
      chunks
        .filter((filename) => filename.endsWith('.js.map'))
        .map((filename) => readFile(join(distDir, filename), 'utf8'))
    )
    sources = sourcemaps.flatMap((sourcemap) => JSON.parse(sourcemap).sources)
  })

  it('must not bundle route utilities that only the server uses into browser chunks', () => {
    const serverRouteUtilSources = Array.from(
      new Set(
        sources.filter(
          (source) =>
            // Only rewrites need it on the client, and this app has none.
            source.includes('compiled/path-to-regexp') ||
            source.includes('shared/lib/router/utils/sorted-routes')
        )
      )
    ).sort()

    expect(serverRouteUtilSources).toEqual([])
  })

  it('should match a dynamic route on a client navigation', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a').click()

    await retry(async () => {
      expect(await browser.elementByCss('#slug').text()).toBe('first')
    })
  })
})
