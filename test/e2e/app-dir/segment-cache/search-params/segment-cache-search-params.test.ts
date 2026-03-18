import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import { retry } from '../../../../lib/next-test-utils'

describe('segment cache (search params)', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('ppr is disabled', () => {})
    return
  }

  it('when fetching with PPR, does not include search params in the cache key', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/search-params', {
      beforePageLoad(page) {
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

  it('when fetching without PPR (e.g. prefetch="unstable_forceStale"), includes the search params in the cache key', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/search-params', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Prefetch a page with search param `b_full`. This link has prefetch='unstable_forceStale'
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
    // prefetch='unstable_forceStale'. This must fetch a new shell, because it can't use the
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

    // Prefetch a different link using prefetch='unstable_forceStale'. Again, this must issue
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

  it('stores prefetched data by its rewritten search params, not the original ones', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/search-params', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    const revealLinkThatRewritesToANewSearchParam = await browser.elementByCss(
      'input[data-link-accordion="/search-params/target-page?searchParam=rewritesToANewSearchParam"]'
    )
    const revealLinkThatAlsoRewritesToThatSameSearchParam =
      await browser.elementByCss(
        'input[data-link-accordion="/search-params/target-page?searchParam=alsoRewritesToThatSameSearchParam"]'
      )
    await act(
      async () => {
        await revealLinkThatRewritesToANewSearchParam.click()
      },
      {
        includes: 'Search param: rewrittenSearchParam',
      }
    )

    // This should not fetch the page data again, because it was rewritten to
    // the same page.
    await act(
      async () => {
        await revealLinkThatAlsoRewritesToThatSameSearchParam.click()
      },
      {
        includes: 'Search param: rewrittenSearchParam',
        block: 'reject',
      }
    )

    // However, fetching any other search param value does a new fetch
    const revealB = await browser.elementByCss(
      'input[data-link-accordion="/search-params/target-page?searchParam=b_full"]'
    )
    await act(
      async () => {
        await revealB.click()
      },
      {
        includes: 'Search param: b_full',
      }
    )
  })

  it('handles rewrites to the same page but with different search params', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/search-params', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Make sure HTML streaming finishes, so that we don't get
    // multiple `<div id="greeting">` elements in the document when we navigate
    // TODO: this seems like it should be handled by waitForHydration?
    await retry(async () => {
      const greeting = browser.locator('#greeting')
      expect(await greeting.isVisible()).toBe(true)
      expect(await greeting.innerText()).toEqual(
        'Greeting (from search params): (none)'
      )
    })

    // This link rewrites to the current page, but with a search param that
    // causes a greeting to be rendered.
    const revealLink = await browser.elementByCss(
      'input[data-link-accordion="/search-params-with-greeting"]'
    )
    await act(
      async () => {
        await revealLink.click()
      },
      {
        includes: 'Greeting (from search params): hello',
      }
    )

    // Clicking the link should update the greeting
    const link = await browser.elementByCss(
      'a[href="/search-params-with-greeting"]'
    )
    await act(async () => {
      await link.click()
    }, 'no-requests')

    expect(await browser.elementById('greeting').text()).toBe(
      'Greeting (from search params): hello'
    )
  })

  // FIXME: search params seem to be dropped from the resume render when deployed
  if (!isNextDeploy) {
    it('handles rewrites to the same page but with no search params', async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/search-params-with-greeting', {
        beforePageLoad(page) {
          act = createRouterAct(page)
        },
      })

      // Make sure HTML streaming finishes, so that we don't get
      // multiple `<div id="greeting">` elements in the document when we navigate
      // TODO: this seems like it should be handled by waitForHydration?
      await retry(async () => {
        const greeting = browser.locator('#greeting')
        expect(await greeting.isVisible()).toBe(true)
        expect(await greeting.innerText()).toEqual(
          'Greeting (from search params): hello'
        )
      })

      // This link rewrites to same target pathname as the current page, but with
      // an internal search param removed
      const revealLink = await browser.elementByCss(
        'input[data-link-accordion="/search-params-with-no-greeting"]'
      )
      await act(
        async () => {
          await revealLink.click()
        },
        {
          includes: 'Greeting (from search params): (none)',
        }
      )

      // Clicking the link should remove the greeting
      const link = await browser.elementByCss(
        'a[href="/search-params-with-no-greeting"]'
      )
      await act(async () => {
        await link.click()
      }, 'no-requests')
      expect(await browser.elementById('greeting').text()).toBe(
        'Greeting (from search params): (none)'
      )
    })
  }
})
