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

describe('turbopack-chunk-names', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should load all dynamically imported modules', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      const text = await browser.elementByCss('#widgets').text()
      expect(text).toContain('my widget loaded')
      expect(text).toContain('legacy widget loaded')
      expect(text).toContain('precedence widget loaded')
      expect(text).toContain('request widget loaded')
      expect(text).toContain('pure request widget loaded')
    })
  })

  it('should load a next/dynamic component', async () => {
    const browser = await next.browser('/dynamic')
    await retry(async () => {
      expect(await browser.elementByCss('#dyn-widget').text()).toBe(
        'dyn widget loaded'
      )
    })
  })

  if (isTurbopack) {
    if (isNextDev) {
      it('should include the chunk name in dev chunk URLs', async () => {
        const browser = await next.browser('/')
        await retry(async () => {
          const text = await browser.elementByCss('#widgets').text()
          expect(text).toContain('request widget loaded')
        })

        const urls = await loadedResourceUrls(browser)
        expect(urls.some((url) => url.includes('/my-widget-'))).toBe(true)
        expect(urls.some((url) => url.includes('/legacy-widget-'))).toBe(true)
        // `turbopackChunkName` takes precedence over `webpackChunkName`
        expect(urls.some((url) => url.includes('/wins-'))).toBe(true)
        expect(urls.some((url) => url.includes('/loses-'))).toBe(false)
        // `[request]` is substituted with the sanitized import request
        expect(urls.some((url) => url.includes('/lazy-request-widget-'))).toBe(
          true
        )
        // a bare `[request]` name derives the chunk name from the imported file
        expect(urls.some((url) => url.includes('/pure-request-widget-'))).toBe(
          true
        )
      })

      it('should include the chunk name in dev chunk URLs for next/dynamic', async () => {
        const browser = await next.browser('/dynamic')
        await retry(async () => {
          expect(await browser.elementByCss('#dyn-widget').text()).toBe(
            'dyn widget loaded'
          )
        })

        const urls = await loadedResourceUrls(browser)
        expect(urls.some((url) => url.includes('/dyn-widget-'))).toBe(true)
      })
    } else {
      it('should emit chunk files that carry the chunk name and retain the content hash', async () => {
        const chunks = (
          await listClientChunks(path.join(next.testDir, '.next'))
        ).filter((chunk) => chunk.endsWith('.js'))

        expect(chunks).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              new RegExp(`^${CHUNK_DIR}/my-widget-${HASH}\\.js$`)
            ),
            expect.stringMatching(
              new RegExp(`^${CHUNK_DIR}/legacy-widget-${HASH}\\.js$`)
            ),
            // `turbopackChunkName` takes precedence over `webpackChunkName`
            expect.stringMatching(
              new RegExp(`^${CHUNK_DIR}/wins-${HASH}\\.js$`)
            ),
            // `[request]` is substituted with the sanitized import request
            expect.stringMatching(
              new RegExp(`^${CHUNK_DIR}/lazy-request-widget-${HASH}\\.js$`)
            ),
            // a bare `[request]` name derives the chunk name from the imported file
            expect.stringMatching(
              new RegExp(`^${CHUNK_DIR}/pure-request-widget-${HASH}\\.js$`)
            ),
            // next/dynamic loaders support the magic comment as well
            expect.stringMatching(
              new RegExp(`^${CHUNK_DIR}/dyn-widget-${HASH}\\.js$`)
            ),
          ])
        )

        // The losing `webpackChunkName` must not be used
        expect(chunks.some((chunk) => chunk.includes('loses-'))).toBe(false)
      })

      it('should load the named chunk files in the browser', async () => {
        const browser = await next.browser('/')
        await retry(async () => {
          const text = await browser.elementByCss('#widgets').text()
          expect(text).toContain('my widget loaded')
        })

        const urls = await loadedResourceUrls(browser)
        // Note: no `$` anchor, the chunk URL may carry a query string (e.g. `?dpl=...`).
        expect(
          urls.some((url) => new RegExp(`/my-widget-${HASH}\\.js`).test(url))
        ).toBe(true)
      })
    }
  }
})
