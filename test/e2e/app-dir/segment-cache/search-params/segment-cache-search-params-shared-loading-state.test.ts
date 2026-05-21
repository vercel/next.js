import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('segment cache (search params shared loading state)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is disabled', () => {})
    return
  }

  it(
    "if there's no matching prefetch entry for a page with particulular " +
      'search params, optimistically reuse a prefetch entry with the same ' +
      'pathname and different search params',
    async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser(
        '/search-params-shared-loading-state',
        {
          beforePageLoad(page) {
            act = createRouterAct(page)
          },
        }
      )

      // Reveal and prefetch the link without search params
      const revealFirstLink = await browser.elementByCss(
        'input[data-link-accordion="/search-params-shared-loading-state/target-page"]'
      )
      await act(
        async () => {
          await revealFirstLink.click()
        },
        {
          includes: 'Static content',
        }
      )

      // Reveal the second link (with search params). Under optimistic
      // routing, the cached entry for the no-search-params URL is reused
      // for this differently-keyed URL, so no new prefetch is initiated.
      const revealSecondLink = await browser.elementByCss(
        'input[data-link-accordion="/search-params-shared-loading-state/target-page?param=test"]'
      )
      await act(async () => {
        await revealSecondLink.click()
      }, 'no-requests')

      // Navigate to the target page. No additional requests are made: the
      // page is fully static and the prefetch for the same pathname is
      // reused even though the search params differ.
      const link = await browser.elementByCss(
        'a[href="/search-params-shared-loading-state/target-page?param=test"]'
      )
      await act(async () => {
        await link.click()
      }, 'no-requests')

      // Verify the navigation completed successfully
      const staticContent = await browser.elementById('static-content')
      expect(await staticContent.text()).toBe('Static content')
      const searchParamsContent = await browser.elementById(
        'search-params-content'
      )
      expect(await searchParamsContent.text()).toBe('Search param value: test')
    }
  )
})
