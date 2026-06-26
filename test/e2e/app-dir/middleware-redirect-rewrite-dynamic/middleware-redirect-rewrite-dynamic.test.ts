import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Repro for https://github.com/vercel/next.js/issues/95195
//
// The proxy (middleware):
//   /a -> redirect to /
//   /  -> rewrite to /a   (a dynamic, `force-dynamic` page that reads params)
//
// On a client-side navigation to `/a`, the proxy redirect (/a -> /) should be
// reflected in the browser URL. The regression is that the URL stays on `/a`.
describe('middleware-redirect-rewrite-dynamic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function pathname(href: string) {
    return new URL(href).pathname
  }

  // Hard navigation: the proxy redirect IS followed. `/a` -> `/` (which is
  // rewritten back to the `/a` page).
  it('hard navigation to /a redirects to /', async () => {
    const browser = await next.browser('/a')
    await retry(async () => {
      expect(pathname(await browser.url())).toBe('/')
    })
    expect(await browser.elementByCss('[data-testid="page"]').text()).toBe(
      'slug: a'
    )
  })

  // Client-side (soft) navigation: the proxy redirect should be applied to the
  // URL as well. The regression is that the URL stays on `/a`.
  it('client-side navigation to /a should redirect to /', async () => {
    const browser = await next.browser('/two')
    await browser.elementByCss('a[href="/a"]').click()

    // The redirected content renders (rewrite of / -> /a page).
    await retry(async () => {
      expect(await browser.elementByCss('[data-testid="page"]').text()).toBe(
        'slug: a'
      )
    })

    // The browser URL should reflect the proxy redirect (/a -> /).
    await retry(async () => {
      expect(pathname(await browser.url())).toBe('/')
    })
  })
})
