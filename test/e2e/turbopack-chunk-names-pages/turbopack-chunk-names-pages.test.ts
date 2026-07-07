import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { listClientChunks, retry } from 'next-test-utils'

// The 13-character base38 content hash appended to production chunk names.
const HASH = '[0-9a-z_-]{13}'
// The test harness may enable immutable assets, which moves client chunks
// from `static/chunks/` to `static/immutable/chunks/`.
const CHUNK_DIR = 'static/(?:immutable/)?chunks'

async function loadedResourceUrls(browser: any): Promise<string[]> {
  return browser.eval(
    `performance.getEntriesByType('resource').map((entry) => entry.name)`
  )
}

describe('turbopack-chunk-names-pages', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should load all dynamically imported modules', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      const text = await browser.elementByCss('#widgets').text()
      expect(text).toContain('pages widget loaded')
      expect(text).toContain('pages legacy widget loaded')
    })
  })

  it('should load a next/dynamic component', async () => {
    const browser = await next.browser('/dynamic')
    await retry(async () => {
      expect(await browser.elementByCss('#dyn-widget').text()).toBe(
        'pages dyn widget loaded'
      )
    })
  })

  if (isTurbopack) {
    if (isNextDev) {
      it('should include the chunk name in dev chunk URLs', async () => {
        const browser = await next.browser('/')
        await retry(async () => {
          const text = await browser.elementByCss('#widgets').text()
          expect(text).toContain('pages widget loaded')
        })

        const urls = await loadedResourceUrls(browser)
        expect(urls.some((url) => url.includes('/pages-widget-'))).toBe(true)
        expect(urls.some((url) => url.includes('/pages-legacy-widget-'))).toBe(
          true
        )
      })

      it('should include the chunk name in dev chunk URLs for next/dynamic', async () => {
        const browser = await next.browser('/dynamic')
        await retry(async () => {
          expect(await browser.elementByCss('#dyn-widget').text()).toBe(
            'pages dyn widget loaded'
          )
        })

        const urls = await loadedResourceUrls(browser)
        expect(urls.some((url) => url.includes('/pages-dyn-widget-'))).toBe(
          true
        )
      })
    } else {
      it('should emit chunk files that carry the chunk name and retain the content hash', async () => {
        const chunks = (
          await listClientChunks(path.join(next.testDir, '.next'))
        ).filter((chunk) => chunk.endsWith('.js'))

        expect(chunks).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              new RegExp(`^${CHUNK_DIR}/pages-widget-${HASH}\\.js$`)
            ),
            expect.stringMatching(
              new RegExp(`^${CHUNK_DIR}/pages-legacy-widget-${HASH}\\.js$`)
            ),
            expect.stringMatching(
              new RegExp(`^${CHUNK_DIR}/pages-dyn-widget-${HASH}\\.js$`)
            ),
          ])
        )
      })
    }
  }
})
