import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('scroll: false with a mismatching prefetch', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  // When a navigation's dynamic response doesn't match the prefetched route
  // (e.g. a proxy rewrites the request to a different route), the client
  // retries the navigation using the data it received from the server. The
  // retry must inherit the scroll behavior of the original navigation;
  // otherwise `scroll={false}` is lost and the page scrolls to the top.
  it('preserves scroll={false} when the navigation is retried after a tree mismatch', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/scroll-false-mismatch', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    const href = '/scroll-false-mismatch/dynamic-page/a?mismatch-rewrite=./b'

    // Reveal the link to trigger a prefetch of page A.
    const toggle = await browser.elementByCss(
      `input[data-link-accordion="${href}"]`
    )
    await act(async () => await toggle.click(), {
      includes: 'Loading a...',
    })

    // Scroll the link into view, away from the top of the page.
    const link = await browser.elementByCss(`a[href="${href}"]`)
    await browser.eval(
      `document.querySelector('a[href="${href}"]').scrollIntoView({ block: 'center' })`
    )
    const scrollBefore = await browser.eval<number>('window.scrollY')
    expect(scrollBefore).toBeGreaterThan(1000)

    // Navigate with `scroll={false}`. The navigation will rewrite to a
    // different route than the one that was prefetched, which triggers a
    // retry once the dynamic response arrives.
    await act(
      async () => {
        await link.click()
        // Immediately after the click, the prefetched loading state for page A
        // is shown.
        await browser.elementById('dynamic-page-loading-a')
      },
      // The dynamic response for page B is a mismatch. The client re-renders
      // using the route from the server.
      [{ includes: 'Dynamic page b' }]
    )

    const pageBContent = await browser.elementById('dynamic-page-content-b')
    expect(await pageBContent.text()).toBe('Dynamic page b')

    // The retry didn't scroll the page back to the top. (Don't assert the exact
    // offset: the browser may adjust it slightly when the content is swapped.)
    expect(await browser.eval<number>('window.scrollY')).toBeGreaterThan(
      scrollBefore - 200
    )
  })
})
