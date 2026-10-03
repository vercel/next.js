import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('force stale', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is disabled in dev', () => {})
    return
  }

  it(
    'during a navigation, don\'t request segments that have a pending "full" ' +
      'prefetch already in progress',
    async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      await act(
        async () => {
          // Reveal a link to a dynamic page. The Link has prefetch={true}, so the
          // full page data is prefetched, including dynamic content.
          const toggleLinkVisibility = await browser.elementByCss(
            'input[data-link-accordion="/dynamic"]'
          )
          await act(async () => await toggleLinkVisibility.click(), {
            includes: 'Dynamic page content',
            // Block the data from loading into the client so we can test what
            // happens if we request the same segment again during a navigation.
            block: true,
          })

          // Initiate a navigation to the dynamic page. Even though the dynamic
          // content from the prefetch hasn't loaded yet, the router should not
          // request the same segment again, because it knows the data it
          // receives from the prefetch will be complete. This assumption is
          // _only_ correct for "full" prefetches, because we explicitly instruct
          // the server not to omit any dynamic or runtime data.
          const link = await browser.elementByCss('a[href="/dynamic"]')
          await link.click()
        },
        // There should have been no additional requests upon navigation
        'no-requests'
      )

      // The data succesfully streams in.
      const content = await browser.elementById('dynamic-page-content')
      expect(await content.text()).toBe('Dynamic page content')
    }
  )

  it(
    'during a "full" prefetch, read from bfcache before issuing new ' +
      'prefetch request',
    async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      // Navigate to the dynamic page using the link without prefetch.
      // This will fetch the page data and store it in the bfcache.
      await act(
        async () => {
          const link = await browser.elementById('link-without-prefetch')
          await link.click()
        },
        {
          includes: 'Dynamic page content',
        }
      )

      // Navigate back to the home page
      await browser.back()

      // Now reveal a link with prefetch={true} to the same page. Because we've
      // already navigated to this page, the route entry and segment data
      // should already be in the cache. The prefetch should reuse the cached
      // data instead of making a new request to the server.
      await act(async () => {
        const toggleLinkVisibility = await browser.elementByCss(
          'input[data-link-accordion="/dynamic"]'
        )
        await toggleLinkVisibility.click()
      }, 'no-requests')
    }
  )

  it(
    'a prefetch={true} link fetches only the dynamic data that a default ' +
      'prefetch of the same URL left out',
    async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      // Reveal a default link. The prefetch includes the static layout and
      // the loading state, but not the dynamic page content. (With Cache
      // Components this is a per-segment static prefetch; without, it's a
      // prefetch up to the loading boundary.)
      await act(async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="partially-static-default"]'
        )
        await toggle.click()
      }, [
        { includes: 'Static layout content' },
        { includes: 'Partially static page content', block: 'reject' },
      ])

      // Reveal a prefetch={true} link to the same URL. It requests the
      // dynamic page content, but not the layout, which is already cached.
      await act(async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="partially-static-full"]'
        )
        await toggle.click()
      }, [
        { includes: 'Partially static page content' },
        { includes: 'Static layout content', block: 'reject' },
      ])

      // Everything was prefetched, so the navigation makes no requests.
      await act(async () => {
        const link = await browser.elementById('partially-static-default')
        await link.click()
      }, 'no-requests')
      expect(await browser.elementById('partially-static-layout').text()).toBe(
        'Static layout content'
      )
      expect(await browser.elementById('partially-static-page').text()).toBe(
        'Partially static page content'
      )
    }
  )

  it(
    'a default link does not re-request data already fetched by a ' +
      'prefetch={true} link to the same URL',
    async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      // The prefetch={true} link fetches the whole page, including the
      // dynamic content.
      await act(async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="partially-static-full"]'
        )
        await toggle.click()
      }, [
        { includes: 'Static layout content' },
        { includes: 'Partially static page content' },
      ])

      // A default link to the same URL has nothing left to prefetch.
      await act(async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="partially-static-default"]'
        )
        await toggle.click()
      }, 'no-requests')

      // Navigating from the default link makes no requests either.
      await act(async () => {
        const link = await browser.elementById('partially-static-default')
        await link.click()
      }, 'no-requests')
      expect(await browser.elementById('partially-static-page').text()).toBe(
        'Partially static page content'
      )
    }
  )

  it('back/forward navigations do not make requests', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    await act(
      async () => {
        const link = await browser.elementById('link-without-prefetch')
        await link.click()
      },
      { includes: 'Dynamic page content' }
    )
    expect(await browser.elementById('dynamic-page-content').text()).toBe(
      'Dynamic page content'
    )

    // Both pages are restored from the back/forward cache.
    await act(async () => {
      await browser.back()
    }, 'no-requests')
    await browser.elementById('link-without-prefetch')

    await act(async () => {
      await browser.forward()
    }, 'no-requests')
    expect(await browser.elementById('dynamic-page-content').text()).toBe(
      'Dynamic page content'
    )
  })
})
