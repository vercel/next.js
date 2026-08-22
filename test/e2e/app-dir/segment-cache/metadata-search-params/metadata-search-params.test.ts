import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'

describe('segment cache (metadata search params)', () => {
  const isCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    // Cache Components has different partial prerender and prefetch semantics.
    skipStart: isCacheComponents,
  })
  if (skipped) return

  if (isCacheComponents) {
    test('prefetching is covered by the Cache Components suites', () => {})
    return
  }

  if (isNextDev) {
    test('prefetching is disabled in development', () => {})
    return
  }

  it('does not reuse metadata across search params after a static prefetch attempt', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    // Start two prefetches for the same route with different search params in
    // the same render, then wait for both to settle. Neither result may replace
    // the other under a shared key.
    await act(async () => {
      const toggle = await browser.elementByCss('input[data-prefetch-links]')
      await toggle.click()
    })

    await browser.elementByCss('a[href="/search?q=alpha"]').click()
    await browser.waitForElementByCss('h1')
    expect(await browser.elementByCss('h1').text()).toBe('Results for alpha')
    await retry(async () => {
      expect(await browser.eval(() => document.title)).toBe('Results for alpha')
    })

    // A search-only navigation that was not prefetched must also replace the
    // head, rather than leaving whichever prefetch settled last in place.
    await browser.elementByCss('a[href="/search?q=gamma"]').click()
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Results for gamma')
      expect(await browser.eval(() => document.title)).toBe('Results for gamma')
    })
  })
})
