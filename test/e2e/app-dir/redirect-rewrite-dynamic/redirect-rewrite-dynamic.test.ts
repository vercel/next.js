import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'

// Reproduction for https://github.com/vercel/next.js/issues/95195
//
// Proxy rules:
//   /a -> redirect to /
//   /  -> rewrite to /a   (a dynamic, param-reading page)
//
// On a client-side navigation to `/a`, the proxy redirects to `/`. The URL in
// the address bar should update to the redirect destination, including any
// configured basePath. Hard navigation (typing the URL / reload) works
// correctly; only client-side navigation regressed.
describe.each([
  { label: 'without basePath', basePath: '' },
  { label: 'with basePath', basePath: '/base/path' },
])('redirect to a rewritten dynamic route (#95195) $label', ({ basePath }) => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    ...(basePath
      ? {
          overrideFiles: {
            'next.config.js': `module.exports = { basePath: '${basePath}' }`,
          },
        }
      : {}),
  })

  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  function relativeHref(href: string) {
    const url = new URL(href)
    return url.pathname + url.search + url.hash
  }

  const redirectDestination = basePath || '/'

  it('hard navigation to /a uses the redirect destination', async () => {
    // Sanity check: the proxy redirect works on a full page load.
    const browser = await next.browser(`${basePath}/a`)
    expect(await browser.elementById('page').text()).toBe('slug: a')
    expect(relativeHref(await browser.url())).toBe(redirectDestination)
  })

  it('client navigation to /a uses the redirect destination', async () => {
    let page: Playwright.Page
    const browser = await next.browser(`${basePath}/two`, {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })

    // Starting page renders the dynamic `/two` route (slug === "two").
    expect(await browser.elementById('page').text()).toBe('slug: two')

    // Reveal the link (prefetch is disabled, so no request fires here) and
    // click it to navigate to /a.
    const toggle = await browser.elementByCss('input[data-link-accordion="/a"]')
    await toggle.click()
    const link = await browser.elementByCss(`a[href="${basePath}/a"]`)
    await link.click()

    // The proxy redirects /a -> / (then rewrites / -> /a). Wait for the client
    // router to settle on the redirect destination. This is an event-driven
    // wait for the exact expected URL: if the redirect isn't reflected (the
    // bug), it times out and fails, rather than being papered over by polling.
    await page.waitForURL((url) => url.pathname === redirectDestination)

    // The rewritten home page content rendered, and the URL reflects the
    // redirect destination rather than the link target.
    expect(await browser.elementById('page').text()).toBe('slug: a')
    expect(relativeHref(await browser.url())).toBe(redirectDestination)
  })
})
