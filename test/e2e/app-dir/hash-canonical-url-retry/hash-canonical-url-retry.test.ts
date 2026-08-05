import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The retry writer of `RouteCacheEntry.canonicalUrl`:
//
//   ppr-navigations.ts  dispatchRetryDueToTreeMismatch
//   createHrefFromUrl(retryUrl)   // no `false` — keeps the hash
//
// `retryUrl` is `fetchMissingDynamicData`'s resolved URL, which comes from
// `fetchServerResponse`:
//
//   fetch-server-response.ts
//   const canonicalUrl = res.redirected ? responseUrl : originalUrl
//
// `originalUrl` is the navigation URL and carries the hash, so the writer can
// store a hash-ful canonical URL — the same invariant break as
// create-initial-router-state and server-action-reducer.
//
// Reaching that branch in production is another matter. The two retry exits
// that carry a seed are:
//
//   RedirectRetry — `res.redirected` is true, so the URL comes from the
//     redirect response and never has a fragment. Covered below.
//   SoftRetry     — needs an unknown parallel route, which the code itself
//     documents as dev/HMR-only ("the set of parallel routes for a layout does
//     not change over the lifetime of a build/deployment").
//
// So this suite pins the reachable half: a redirect retry must not corrupt the
// entry it rewrites. See the source audit for why the SoftRetry half has no
// production repro.
describe('hash canonical url - redirect retry', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('skipped in dev mode', () => {})
    return
  }

  type Browser = Awaited<ReturnType<typeof next.browser>>

  async function currentUrl(browser: Browser) {
    return new URL(await browser.url())
  }

  async function navigateToRedirectedRoute() {
    const browser = await next.browser('/two')
    await browser.waitForElementByCss('#page')

    // Reveal the link (prefetch is disabled, so no request fires here) and
    // click it. The proxy redirects /a -> / and rewrites / -> /a, so the
    // navigation commits one URL and then has to correct it.
    const toggle = await browser.elementByCss(
      'input[data-link-accordion="/a#modal"]'
    )
    await toggle.click()
    const link = await browser.elementByCss('a[href="/a#modal"]')
    await link.click()

    await browser.waitForElementByCss('#home')
    return browser
  }

  it('should settle on the redirect destination', async () => {
    const browser = await navigateToRedirectedRoute()

    await retry(async () => {
      const url = await currentUrl(browser)
      expect(url.pathname).toBe('/')
    })
  })

  it('should not produce a double fragment on a push after a redirect retry', async () => {
    const browser = await navigateToRedirectedRoute()

    await browser.elementById('push-other-hash').click()

    await retry(async () => {
      const url = await currentUrl(browser)
      expect(url.pathname).toBe('/')
      expect(url.hash).toBe('#other')
    })
  })

  it('should clear the hash on a replace after a redirect retry', async () => {
    const browser = await navigateToRedirectedRoute()

    await browser.elementById('push-other-hash').click()
    await retry(async () => {
      expect((await currentUrl(browser)).hash).toBe('#other')
    })

    await browser.elementById('replace-without-hash').click()

    await retry(async () => {
      const url = await currentUrl(browser)
      expect(url.pathname).toBe('/')
      expect(url.hash).toBe('')
    })
  })
})
