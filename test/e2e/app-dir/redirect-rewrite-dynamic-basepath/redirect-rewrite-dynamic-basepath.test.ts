import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'

// Reproduction for https://github.com/amannn/nextjs-16-3-bug-repro-basepath
// (the basePath variant of ../redirect-rewrite-dynamic, see issue #95195).
//
// `basePath: '/base/path'` is configured, and the proxy rules are:
//   /a -> redirect to /
//   /  -> rewrite to /a   (a dynamic, param-reading page)
//
// On a client-side navigation to `/base/path/a`, the proxy redirects to
// `/base/path`. The URL in the address bar should update to `/base/path`,
// but on the 16.3 preview it became `/`: the cache-busting redirect issued
// by `validateRSCRequestHeaders` was built from the basePath-stripped
// `req.url`, so the client committed a URL outside the basePath (a reload
// from there 404s). Hard navigation works correctly; only client-side
// navigation regressed.
describe('redirect to a rewritten dynamic route with basePath', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  function relativeHref(href: string) {
    const url = new URL(href)
    return url.pathname + url.search + url.hash
  }

  it('hard navigation to /a redirects to the basePath root', async () => {
    // Sanity check: the proxy redirect works on a full page load.
    const browser = await next.browser('/base/path/a')
    expect(await browser.elementById('page').text()).toBe('slug: a')
    expect(relativeHref(await browser.url())).toBe('/base/path')
  })

  it('client-side navigation to /a should keep the basePath in the URL', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/base/path/two', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })

    // Starting page renders the dynamic `/two` route (slug === "two").
    expect(await browser.elementById('page').text()).toBe('slug: two')

    // Reveal the link (prefetch is disabled, so no request fires here) and
    // click it to navigate to /a. The rendered anchor includes the basePath.
    const toggle = await browser.elementByCss('input[data-link-accordion="/a"]')
    await toggle.click()
    const link = await browser.elementByCss('a[href="/base/path/a"]')
    await link.click()

    // The proxy redirects /a -> / (then rewrites / -> /a). Wait for the client
    // router to settle on the redirect destination. This is an event-driven
    // wait for the exact expected URL: if the basePath is dropped (the bug),
    // it times out and fails, rather than being papered over by polling.
    await page.waitForURL((url) => url.pathname === '/base/path')

    // The rewritten home page content rendered, and the URL reflects the
    // redirect destination `/base/path`, not `/` and not the link target.
    expect(await browser.elementById('page').text()).toBe('slug: a')
    expect(relativeHref(await browser.url())).toBe('/base/path')
  })
})
