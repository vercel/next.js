import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('segment cache (metadata)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }
  describe("regression: prefetch the head if it's missing even if all other data is cached", () => {
    it('pages with dynamic content and dynamic metadata, using a full prefetch', async () => {
      let act: ReturnType<typeof createRouterAct>
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
        // Because the link is prefetched with prefetch={true},
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
        // It should not prefetch the page title or content again, because it
        // was already cached.
        {
          includes: 'Dynamic Title',
          block: 'reject',
        },
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
    })

    it('pages with runtime-prefetchable content and dynamic metadata, using a runtime prefetch', async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(p) {
          act = createRouterAct(p)
        },
      })

      // Runtime-prefetch a page.
      // It only uses cookies, so this should be a complete prefetch.
      await act(async () => {
        const checkbox = await browser.elementByCss(
          'input[data-link-accordion="/page-with-runtime-prefetchable-head"]'
        )
        await checkbox.click()
      }, [
        // Because the link is prefetched with prefetch={true},
        // we should be able to prefetch the title, even though it's dynamic.
        {
          includes: 'Runtime-prefetchable title',
        },
        {
          includes: 'Target page',
        },
      ])

      // Now runtime-prefetch a link that rewrites to the same underlying page.
      await act(async () => {
        const checkbox = await browser.elementByCss(
          'input[data-link-accordion="/rewrite-to-page-with-runtime-prefetchable-head"]'
        )
        await checkbox.click()
      }, [
        // It should not prefetch the page title or content again, because it
        // was already cached.
        {
          includes: 'Runtime-prefetchable title',
          block: 'reject',
        },
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
          'a[href="/rewrite-to-page-with-runtime-prefetchable-head"]'
        )
        await link.click()
        const pageContent = await browser.elementById('target-page')
        expect(await pageContent.text()).toBe('Target page')
        const title = await browser.eval(() => document.title)
        expect(title).toBe('Runtime-prefetchable title')
      }, 'no-requests')
    })
  })
})
