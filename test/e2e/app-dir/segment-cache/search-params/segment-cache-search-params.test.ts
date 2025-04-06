import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from '../router-act'

describe('segment cache (search params)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('ppr is disabled', () => {})
    return
  }

  it('when fetching with PPR, does not include search params in the cache key', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/search-params', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    // Prefetch a page with search param `a_PPR`.
    const revealA = await browser.elementByCss(
      'input[data-link-accordion="/search-params/target-page?searchParam=a_PPR"]'
    )
    await act(
      async () => {
        await revealA.click()
      },
      // The response will include a shell of the page, but nothing that is
      // based on the search param.
      {
        includes:
          // This is the id assigned to a container div
          'target-page-with-search-param',
      }
    )

    // Prefetch the same page but with the search param changed to `c_PPR`.
    const revealC = await browser.elementByCss(
      'input[data-link-accordion="/search-params/target-page?searchParam=c_PPR"]'
    )
    await act(
      async () => {
        await revealC.click()
      },
      // This should not issue a new request for the page segment, because
      // search params are not included in the the PPR shell. So we can reuse
      // the shell we fetched for `searchParam=a`.
      { includes: 'target-page-with-search-param', block: 'reject' }
    )

    // Navigate to one of the links.
    const linkC = await browser.elementByCss(
      'a[href="/search-params/target-page?searchParam=c_PPR"]'
    )
    await act(
      async () => {
        await linkC.click()
      },
      // The search param streams in on navigation
      {
        includes: 'Search param: c_PPR',
      }
    )
    const result = await browser.elementById('target-page-with-search-param')
    expect(await result.innerText()).toBe('Search param: c_PPR')
  })

  it('when fetching without PPR (e.g. prefetch={true}), includes the search params in the cache key', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/search-params', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    // Prefetch a page with search param `b_full`. This link has prefetch={true}
    // so it will fetch the entire page, including the search param.
    const revealB = await browser.elementByCss(
      'input[data-link-accordion="/search-params/target-page?searchParam=b_full"]'
    )
    await act(
      async () => {
        await revealB.click()
      },
      // The response will include the entire page, including the search param.
      {
        includes: 'Search param: b_full',
      }
    )

    // Prefetch a link with a different search param, and without
    // prefetch={true}. This must fetch a new shell, because it can't use the
    // entry we fetched for `searchParam=b_full` (because that one wasn't a
    // shell — it included the search param).
    const revealA = await browser.elementByCss(
      'input[data-link-accordion="/search-params/target-page?searchParam=a_PPR"]'
    )
    await act(
      async () => {
        await revealA.click()
      },
      // The response will include a shell of the page, but nothing that is
      // based on the search param.
      { includes: 'target-page-with-search-param' }
    )

    // Prefetch a different link using prefetch={true}. Again, this must issue
    // a new request, because it's a full page prefetch and we haven't fetched
    // this particular search param before.
    // TODO: As an future optimization, if a navigation to this link occurs
    // before the prefetch completes, we could render the PPR shell in
    // the meantime, since it contains no search params. This would effectively
    // be a "per-segment fallback".
    const revealD = await browser.elementByCss(
      'input[data-link-accordion="/search-params/target-page?searchParam=d_full"]'
    )
    await act(
      async () => {
        await revealD.click()
      },
      // The response will include the entire page, including the search param.
      { includes: 'Search param: d_full' }
    )

    // Navigate to one of the fully prefetched links.
    const linkD = await browser.elementByCss(
      'a[href="/search-params/target-page?searchParam=d_full"]'
    )
    await act(
      async () => {
        await linkD.click()
        const result = await browser.elementById(
          'target-page-with-search-param'
        )
        expect(await result.innerText()).toBe('Search param: d_full')
      },
      // No requests should be issued, because the page was fully prefetched.
      'no-requests'
    )
  })
})
