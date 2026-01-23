import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('mismatching prefetch', () => {
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

  it(
    'recovers when a navigation rewrites to a different route than the one ' +
      'that was prefetched',
    async () => {
      let page: Playwright.Page
      const browser = await next.browser('/mismatching-prefetch', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      // Reveal the link to trigger a prefetch of page A.
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/mismatching-prefetch/dynamic-page/a?mismatch-rewrite=./b"]'
      )
      await act(async () => await toggle.click(), {
        includes: 'Loading a...',
      })

      // When we click the link to navigate, the navigation will rewrite to
      // a different route than the one that was prefetched.
      await act(
        async () => {
          const link = await browser.elementByCss(
            'a[href="/mismatching-prefetch/dynamic-page/a?mismatch-rewrite=./b"]'
          )
          await link.click()
          // Immeidately after the click, the app navigates to the loading state
          // that was prefetched, which is for page A.
          const pageALoading = await browser.elementById(
            'dynamic-page-loading-a'
          )
          expect(relativeHref(await browser.url())).toBe(
            '/mismatching-prefetch/dynamic-page/a?mismatch-rewrite=./b'
          )
          expect(await pageALoading.text()).toBe('Loading a...')

          // Simultaneously, the dynamic content for page A is requested.
        },
        // When the dynamic request is received, Next.js will discover that the
        // route has changed and rewrite to page B. The client will detect a
        // mismatch and render again using the new route from the server.
        //
        // This shouldn't require a second dynamic request, though, because we
        // can reuse the data sent by the server. So, page B should only render
        // once on the server.
        [{ includes: 'Dynamic page b' }]
      )

      // The redirected page loads successfully.
      const pageBContent = await browser.elementById('dynamic-page-content-b')
      expect(await pageBContent.text()).toBe('Dynamic page b')

      // The browser's URL hasn't changed, because this was a rewrite, not
      // a redirect.
      expect(relativeHref(await browser.url())).toBe(
        '/mismatching-prefetch/dynamic-page/a?mismatch-rewrite=./b'
      )
    }
  )
})
