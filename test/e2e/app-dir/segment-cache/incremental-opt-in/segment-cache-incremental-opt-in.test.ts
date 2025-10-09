import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import { Page } from 'playwright'

describe('segment cache (incremental opt in)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('ppr is disabled', () => {})
    return
  }

  async function testPrefetchDeduping(linkHref) {
    // This e2e test app is designed to verify that if you prefetch a link
    // multiple times, the prefetches are deduped by the client cache
    // (unless/until they become stale). It works by toggling the visibility of
    // the links and checking whether any prefetch requests are issued.
    //
    // Throughout the duration of the test, we collect all the prefetch requests
    // that occur. Then at the end we confirm there are no duplicates.
    const prefetches = new Map()
    const duplicatePrefetches = new Map()
    const unexpectedResponses = []

    let currentPage: Page
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        currentPage = page
        await page.route('**/*', async (route) => {
          const request = route.request()
          const headers = await request.allHeaders()
          const isPrefetch =
            headers['rsc'] !== undefined &&
            headers['next-router-prefetch'] !== undefined
          if (isPrefetch) {
            const url = request.url()
            const prefetchInfo = {
              href: new URL(url).pathname,
              segment: headers['next-router-segment-prefetch'],
              base: headers['next-router-state-tree'] ?? null,
            }
            const key = JSON.stringify(prefetchInfo)
            if (prefetches.has(key)) {
              duplicatePrefetches.set(key, prefetchInfo)
            } else {
              prefetches.set(key, prefetchInfo)
            }
            const response = await page.request.fetch(request, {
              maxRedirects: 0,
            })
            const status = response.status()
            if (status !== 200) {
              unexpectedResponses.push({
                status,
                url,
                headers: response.headers(),
                response: await response.text(),
              })
            }
            return route.fulfill({ response })
          }
          route.continue()
        })
      },
    })

    // Each link on the test page has a checkbox that controls its visibility.
    // It starts off as hidden.
    const checkbox = await browser.elementByCss(
      `input[data-link-accordion="${linkHref}"]`
    )
    // Confirm the checkbox is not checked
    expect(await checkbox.isChecked()).toBe(false)

    // Click the checkbox to reveal the link and trigger a prefetch
    await checkbox.click()
    await browser.elementByCss(`a[href="${linkHref}"]`)

    // Toggle the visibility of the link. Prefetches are initiated on viewport,
    // so if the cache does not dedupe then properly, this test will detect it.
    await checkbox.click() // hide
    await checkbox.click() // show
    const link = await browser.elementByCss(`a[href="${linkHref}"]`)

    // Navigate to the target link
    await link.click()

    // Confirm the navigation happened
    await browser.elementById('page-content')
    expect(new URL(await browser.url()).pathname).toBe(linkHref)

    // Wait for all pending requests to complete.
    await currentPage.unrouteAll({ behavior: 'wait' })

    // Finally, assert there were no duplicate prefetches and no unexpected
    // responses.
    expect(prefetches).not.toBeEmpty()
    expect(duplicatePrefetches).toBeEmpty()
    expect(unexpectedResponses).toBeEmpty()
  }

  describe('multiple prefetches to same link are deduped', () => {
    it('page with PPR enabled', () => testPrefetchDeduping('/ppr-enabled'))
    it('page with PPR enabled, and has a dynamic param', () =>
      testPrefetchDeduping('/ppr-enabled/dynamic-param'))
    it('page with PPR disabled', () => testPrefetchDeduping('/ppr-disabled'))
    it('page with PPR disabled, and has a loading boundary', () =>
      testPrefetchDeduping('/ppr-disabled-with-loading-boundary'))
  })

  it('prefetches a dynamic route when PPR is disabled if it has a loading.tsx boundary', async () => {
    let act
    const browser = await next.browser('/', {
      beforePageLoad(p) {
        act = createRouterAct(p)
      },
    })

    // Initiate a prefetch for a dynamic page with no PPR, but with a
    // loading.tsx boundary. We should be able to prefetch up to the
    // loading boundary.
    await act(async () => {
      const checkbox = await browser.elementByCss(
        `input[data-link-accordion="/ppr-disabled-with-loading-boundary"]`
      )
      await checkbox.click()
    }, [
      // Response includes the loading boundary
      { includes: 'Loading...' },
      // but it does not include the dynamic page content
      { includes: 'Page content', block: 'reject' },
    ])

    // Navigate to the page
    await act(
      async () => {
        await browser
          .elementByCss(`a[href="/ppr-disabled-with-loading-boundary"]`)
          .click()
        // We can immediately render the loading boundary before the network
        // responds, because it was prefetched
        const loadingBoundary = await browser.elementById('loading-boundary')
        expect(await loadingBoundary.text()).toBe('Loading...')
      },
      // The page content is fetched on navigation
      { includes: 'Page content' }
    )
    const pageContent = await browser.elementById('page-content')
    expect(await pageContent.text()).toBe('Page content')
  })

  it(
    'skips prefetching a dynamic route when PPR is disabled if everything up ' +
      'to its loading.tsx boundary is already cached',
    async () => {
      let act
      const browser = await next.browser('/', {
        beforePageLoad(p) {
          act = createRouterAct(p)
        },
      })

      // Initiate a prefetch for a dynamic page with no PPR, but with a
      // loading.tsx boundary. We should be able to prefetch up to the
      // loading boundary.
      await act(async () => {
        const checkbox = await browser.elementByCss(
          `input[data-link-accordion="/ppr-disabled-with-loading-boundary"]`
        )
        await checkbox.click()
      }, [
        // Response includes the loading boundary
        { includes: 'Loading...' },
        // but it does not include the dynamic page content
        { includes: 'Page content', block: 'reject' },
      ])

      // When prefetching a different page with the same loading boundary,
      // we should not need to fetch the loading boundary again
      await act(
        async () => {
          const checkbox = await browser.elementByCss(
            `input[data-link-accordion="/ppr-disabled-with-loading-boundary/child"]`
          )
          await checkbox.click()
        },
        { includes: 'Loading...', block: 'reject' }
      )

      // Navigate to the page
      await act(async () => {
        await browser
          .elementByCss(`a[href="/ppr-disabled-with-loading-boundary/child"]`)
          .click()
        // We can immediately render the loading boundary before the network
        // responds, because it was prefetched
        const loadingBoundary = await browser.elementById('loading-boundary')
        expect(await loadingBoundary.text()).toBe('Loading...')
      }, [
        // The page content is fetched on navigation
        { includes: 'Child page content' },
        // The loading boundary is not fetched on navigation, because it
        // was already loaded into the cache during the prefetch for the
        // other page.
        { includes: 'Loading...', block: 'reject' },
      ])
      const pageContent = await browser.elementById('child-page-content')
      expect(await pageContent.text()).toBe('Child page content')
    }
  )

  it('skips prefetching a dynamic route when PPR is disabled if it has no loading.tsx boundary', async () => {
    let act
    const browser = await next.browser('/', {
      beforePageLoad(p) {
        act = createRouterAct(p)
      },
    })

    // Initiate a prefetch for a dynamic page with no loading.tsx and no PPR.
    // The route tree prefetch will tell the client that there is no loading
    // boundary, and therefore the client can skip prefetching the data, since
    // it would be an empty response, anyway.
    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          `input[data-link-accordion="/ppr-disabled"]`
        )
        await checkbox.click()
      },
      // We should not prefetch the page content
      { includes: 'Page content', block: 'reject' }
    )

    // Navigate to the page
    await act(
      async () => {
        await browser.elementByCss(`a[href="/ppr-disabled"]`).click()
      },
      // The page content is fetched on navigation
      { includes: 'Page content' }
    )
    const pageContent = await browser.elementById('page-content')
    expect(await pageContent.text()).toBe('Page content')
  })

  it(
    'prefetches a shared layout on a PPR-enabled route that was previously ' +
      'omitted from a non-PPR-enabled route',
    async () => {
      let act
      const browser = await next.browser('/mixed-fetch-strategies', {
        beforePageLoad(p) {
          act = createRouterAct(p)
        },
      })

      // Initiate a prefetch for the PPR-disabled route first. This will not
      // include the /shared-layout/ segment, because it's inside the
      // loading boundary.
      await act(async () => {
        const checkbox = await browser.elementById('ppr-disabled')
        await checkbox.click()
      })

      // Then initiate a prefetch for the PPR-enabled route. This prefetch
      // should include the /shared-layout/ segment despite the presence of
      // the loading boundary, and despite the earlier non-PPR attempt
      await act(async () => {
        const checkbox = await browser.elementById('ppr-enabled')
        await checkbox.click()
      })

      // Navigate to the PPR-enabled route
      await act(async () => {
        const link = await browser.elementByCss('#ppr-enabled + a')
        await link.click()

        // If we prefetched all the segments correctly, we should be able to
        // reveal the page's loading state, before the server responds.
        await browser.elementById('page-loading-boundary')
      })
    }
  )

  it(
    'when a link is prefetched with <Link prefetch="unstable_forceStale">, no dynamic request ' +
      'is made on navigation',
    async () => {
      let act
      const browser = await next.browser('/mixed-fetch-strategies', {
        beforePageLoad(p) {
          act = createRouterAct(p)
        },
      })

      await act(
        async () => {
          const checkbox = await browser.elementById(
            'ppr-enabled-prefetch-true'
          )
          await checkbox.click()
        },
        {
          includes: 'Dynamic page content',
        }
      )

      // Navigate to fully prefetched route
      const link = await browser.elementByCss('#ppr-enabled-prefetch-true + a')
      await act(
        async () => {
          await link.click()

          // We should be able to fully load the page content, including the
          // dynamic data, before the server responds.
          await browser.elementById('page-content')
        },
        // Assert that no network requests are initiated within this block.
        'no-requests'
      )
    }
  )

  it(
    'when prefetching with prefetch="unstable_forceStale", refetches cache entries that only ' +
      'contain partial data',
    async () => {
      let act
      const browser = await next.browser('/mixed-fetch-strategies', {
        beforePageLoad(p) {
          act = createRouterAct(p)
        },
      })

      // Prefetch a link with PPR
      await act(
        async () => {
          const checkbox = await browser.elementById('ppr-enabled')
          await checkbox.click()
        },
        { includes: 'Loading (PPR shell of shared-layout)...' }
      )

      // Prefetch the same link again, this time with prefetch="unstable_forceStale" to include
      // the dynamic data
      await act(
        async () => {
          const checkbox = await browser.elementById(
            'ppr-enabled-prefetch-true'
          )
          await checkbox.click()
        },
        {
          includes: 'Dynamic content in shared layout',
        }
      )

      // Navigate to the PPR-enabled route
      const link = await browser.elementByCss('#ppr-enabled-prefetch-true + a')
      await act(
        async () => {
          await link.click()

          // If we prefetched all the segments correctly, we should be able to
          // fully load the page content, including the dynamic data, before the
          // server responds.
          //
          // If this fails, it likely means that the partial cache entry that
          // resulted from prefetching the normal link (<Link prefetch={false}>)
          // was not properly re-fetched when the full link (<Link
          // prefetch='unstable_forceStale'>) was prefetched.
          await browser.elementById('page-content')
        },
        // Assert that no network requests are initiated within this block.
        'no-requests'
      )
    }
  )

  it(
    'when prefetching with prefetch="unstable_forceStale", refetches partial cache entries ' +
      "even if there's already a pending PPR request",
    async () => {
      // This test is hard to describe succinctly because it involves a fairly
      // complex race condition between a non-PPR prefetch, a PPR prefetch, and
      // a "full" prefetch. Despite the complexity of the scenario, it's worth
      // testing because could easily happen in real world conditions.

      let act
      const browser = await next.browser('/mixed-fetch-strategies', {
        beforePageLoad(p) {
          act = createRouterAct(p)
        },
      })

      // Initiate a prefetch for the PPR-disabled route first. This will not
      // include the /shared-layout/ segment, because it's inside the
      // loading boundary.
      await act(
        async () => {
          const checkbox = await browser.elementById('ppr-disabled')
          await checkbox.click()
        },
        { includes: 'Loading (has-loading-boundary/loading.tsx)...' }
      )

      // Then initiate a prefetch for the PPR-enabled route.
      await act(async () => {
        // Create an inner act scope so we initate a prefetch but block it
        // from responding.
        await act(
          async () => {
            const checkbox = await browser.elementById('ppr-enabled')
            await checkbox.click()
          },
          {
            // This prefetch should include the /shared-layout/ segment despite
            // the presence of the loading boundary, and despite the earlier
            // non-PPR attempt.
            includes: 'Loading (PPR shell of shared-layout)...',
            // We're going to block it from responding, so we can test what
            // happens if another prefetch is initiated in the meantime.
            block: true,
          }
        )

        // Before the previous prefetch finishes, prefetch the same link again,
        // this time with prefetch="unstable_forceStale" to include the dynamic data.
        await act(
          async () => {
            const checkbox = await browser.elementById(
              'ppr-enabled-prefetch-true'
            )
            await checkbox.click()
          },
          // This prefetch should load the dynamic data in the shared layout
          {
            includes: 'Dynamic content in shared layout',
          }
        )
      })

      // Navigate to the PPR-enabled route.
      await act(
        async () => {
          const link = await browser.elementByCss(
            '#ppr-enabled-prefetch-true + a'
          )
          await link.click()

          // If we prefetched all the segments correctly, we should be able to
          // fully load the page content, including the dynamic data, before the
          // server responds.
          //
          // If this fails, it likely means that the pending cache entry that
          // resulted from prefetching the normal link (<Link prefetch={false}>)
          // was not properly re-fetched when the full link (<Link
          // prefetch='unstable_forceStale'>) was prefetched.
          await browser.elementById('page-content')
        },
        // Assert that no network requests are initiated within this block.
        'no-requests'
      )
    }
  )

  it('fully prefetch a page with a dynamic title', async () => {
    let act
    const browser = await next.browser('/', {
      beforePageLoad(p) {
        act = createRouterAct(p)
      },
    })

    await act(
      async () => {
        const checkbox = await browser.elementByCss(
          'input[data-link-accordion="/ppr-disabled-dynamic-head?foo=yay"]'
        )
        await checkbox.click()
      },
      // Because the link is prefetched with prefetch=true, we should be able to
      // prefetch the title, even though it's dynamic.
      {
        includes: 'Dynamic Title: yay',
        // TODO: Due to a race condition, the metadata is sometimes fetched twice
        // instead of once (though not more than that). The planned fix is to
        // cache metadata separate from the route tree. Then we can remove
        // this option.
        allowMultipleResponses: true,
      }
    )

    // When we navigate to the page, it should not make any additional
    // network requests, because both the segment data and the head were
    // fully prefetched.
    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/ppr-disabled-dynamic-head?foo=yay"]'
      )
      await link.click()
      const pageContent = await browser.elementById('page-content')
      expect(await pageContent.text()).toBe('Page content')
      const title = await browser.eval(() => document.title)
      expect(title).toBe('Dynamic Title: yay')
    }, 'no-requests')
  })
})
