import type * as Playwright from 'playwright'
import webdriver from 'next-webdriver'
import { findPort, nextBuild, retry } from 'next-test-utils'
import { isNextStart } from 'e2e-utils'
import { server } from './server.mjs'

// Regression test for https://github.com/vercel/next.js/issues/92341.
//
// In `output: "export"` mode, a `<Link prefetch={true}>` previously routed
// through the dynamic (Full) prefetch path, which issues an RSC request to
// the bare route path (e.g. `/page1?_rsc=…`). A static host has no way to
// answer that, so it returned the HTML document; the client then failed to
// decode it as Flight and the cache entry was rejected, breaking both the
// prefetch-at-load and the subsequent click navigation.
//
// The fix forces the PPR strategy in export mode so the prefetch reads the
// per-segment `__next.*.txt` files the exporter writes to disk.
describe('Link prefetch={true} in output: "export"', () => {
  if (!isNextStart) {
    // Only the production build emits the `__next.*.txt` segment files that
    // this behavior relies on; dev mode has nothing to assert.
    it('build test should not run during dev test run', () => {})
    return
  }

  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    // Cache Components / PPR is not compatible with `output: "export"`.
    return it.skip('for Cache Components', () => {})
  }

  let port: number

  beforeAll(async () => {
    const appDir = __dirname
    await nextBuild(appDir, undefined, {
      cwd: appDir,
      disableAutoSkewProtection: true,
    })
    port = await findPort()
    server.listen(port)
  })

  afterAll(() => {
    server.close()
  })

  it('prefetches per-segment files and navigates on click', async () => {
    const requestPathnames: string[] = []

    const browser = await webdriver(port, '/', {
      beforePageLoad(page: Playwright.Page) {
        page.on('request', (request) => {
          const { pathname, search } = new URL(request.url())
          requestPathnames.push(pathname + search)
        })
      },
    })

    // A visible `<Link prefetch={true}>` should prefetch the target route's
    // per-segment `__next.*.txt` files (e.g. `__next.page1.__PAGE__.txt`),
    // which are the only RSC artifacts the exporter emits.
    await retry(async () => {
      const segmentRequests = requestPathnames.filter((p) =>
        /^\/page1\/__next\.[^/]+\.txt(\?|$)/.test(p)
      )
      expect(segmentRequests.length).toBeGreaterThan(0)
    })

    // The regression fetched the HTML document (`/page1` with an `_rsc`
    // cache-busting query) and tried to decode it as Flight, which rejected
    // the prefetch cache entry. Guard against that specific URL shape.
    const htmlFallbackRequests = requestPathnames.filter((p) =>
      /^\/page1\/?\?.*_rsc=/.test(p)
    )
    expect(htmlFallbackRequests).toEqual([])

    // A successful client navigation renders the target without a document
    // reload. `#page1-content` only exists on the target route, so reading
    // it proves the click path is wired up end-to-end.
    await browser.elementByCss('a[href="/page1"]').click()

    await retry(async () => {
      expect(await browser.elementById('page1-content').text()).toBe('Page 1')
    })
  })
})
