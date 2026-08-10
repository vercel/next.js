import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from 'next-test-utils'

const CACHE_MISS_WARNING = 'Unexpected cache miss after cache warming phase'

// The App Shell prefetch (next-router-prefetch: '3') renders the runtime shell
// of the /slug/[slug] route. Because the page is a `'use cache'` page that
// awaits static params, params are a hanging input in the final prerender. If
// the prospective (cache-warming) prerender resolved those params instead of
// leaving them hanging, the cached page's key would differ between the two
// prerenders and the final prerender would log an "Unexpected cache miss"
// warning and degrade the cached segment to a dynamic hole.
describe('App Shell prefetching - cached page with generateStaticParams', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('does not report a cache miss when prefetching the shell of a cached page that reads static params', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Revealing the link prefetches the App Shell for /slug/[slug]. Because the
    // shell is param-independent, this single request drives the runtime shell
    // prerender of the cached page whose params are a hanging input.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/slug/prerendered"]')
        .click()
    })

    expect(next.cliOutput).not.toContain(CACHE_MISS_WARNING)
  })

  it('renders the cached page content after navigating to a prefetched shell', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/slug/prerendered"]')
        .click()
    })

    await browser.elementByCss('a[href="/slug/prerendered"]').click()

    await retry(async () => {
      expect(await browser.elementById('slug').text()).toEqual(
        'Slug: prerendered'
      )
    })

    expect(next.cliOutput).not.toContain(CACHE_MISS_WARNING)
  })
})
