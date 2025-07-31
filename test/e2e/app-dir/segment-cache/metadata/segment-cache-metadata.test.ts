import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from '../router-act'

describe('segment cache (metadata)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  it(
    "regression: prefetch the head if it's missing even if all other data " +
      'is cached',
    async () => {
      let act
      const browser = await next.browser('/', {
        beforePageLoad(p) {
          act = createRouterAct(p)
        },
      })

      // Fully prefetch a page
      await act(async () => {
        const checkbox = await browser.elementByCss(
          'input[data-link-accordion="/page-with-dynamic-head"]'
        )
        await checkbox.click()
      }, [
        // Because the link is prefetched with prefetch="unstable_forceStale",
        // we should be able to prefetch the title, even though it's dynamic.
        {
          includes: 'Dynamic Title',
        },
        {
          includes: 'Target page',
        },
      ])

      // Now prefetch a link that rewrites to the same underlying page.
      await act(async () => {
        const checkbox = await browser.elementByCss(
          'input[data-link-accordion="/rewrite-to-page-with-dynamic-head"]'
        )
        await checkbox.click()
      }, [
        // TODO: Ideally, this would not prefetch the dynamic title again,
        // because it was already prefetched by the previous link, and both
        // links resolve to the same underlying route. This is because, unlike
        // segment data, we cache routes solely by their input URL, not by the
        // path of the underlying route. Similarly, we don't cache metadata
        // separately from the route tree. We should probably do one or both.
        {
          includes: 'Dynamic Title',
        },
        // It should not prefetch the page content again, because it was
        // already cached.
        {
          includes: 'Target page',
          block: 'reject',
        },
      ])

      // When we navigate to the page, it should not make any additional
      // network requests, because both the segment data and the head were
      // fully prefetched.
      await act(async () => {
        const link = await browser.elementByCss(
          'a[href="/rewrite-to-page-with-dynamic-head"]'
        )
        await link.click()
        const pageContent = await browser.elementById('target-page')
        expect(await pageContent.text()).toBe('Target page')
        const title = await browser.eval(() => document.title)
        expect(title).toBe('Dynamic Title')
      }, 'no-requests')
    }
  )
})
