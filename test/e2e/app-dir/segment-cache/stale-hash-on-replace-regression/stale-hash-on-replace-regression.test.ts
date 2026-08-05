import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('segment cache - stale hash on replace regression', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped in dev mode', () => {})
    return
  }

  // Regression test for https://github.com/vercel/next.js/issues/96714.
  //
  // Reproduction is taken from the user's report and minimal repro at
  // https://github.com/FelixK-Witt/next-hash-restore-repro:
  //
  // 1. Build and start the application.
  // 2. Open `/p/123#modal` directly in the browser (full page load on a
  //    dynamic param route).
  // 3. Click the button that calls `router.replace(pathname)` with no hash.
  //
  // Expected: URL is `/p/123` with no hash.
  // Buggy:   URL stays `/p/123#modal` — the hash from the initial page load
  //          is restored from the route cache entry's canonicalUrl.

  it('router.replace without a hash clears the hash from the initial page load on a dynamic route', async () => {
    const browser = await next.browser('/p/123#modal')
    await browser.waitForElementByCss('#product-page')

    await retry(async () => {
      const url = new URL(await browser.url())
      expect(url.pathname).toBe('/p/123')
      expect(url.hash).toBe('#modal')
    })

    await browser.elementById('replace-without-hash').click()

    await retry(async () => {
      const url = new URL(await browser.url())
      expect(url.pathname).toBe('/p/123')
      expect(url.hash).toBe('')
    })
  })
})
