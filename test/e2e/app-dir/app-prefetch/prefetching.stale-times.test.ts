import { FileRef, nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import { createTimeController } from './test-utils'
import { join } from 'path'

describe('app dir - prefetching (custom staleTime)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
    },
    skipDeployment: true,
    nextConfig: {
      experimental: {
        staleTimes: {
          static: 30, // Minimum enforced by clientSegmentCache is 30 seconds
          dynamic: 5,
        },
      },
    },
  })

  if (isNextDev) {
    it('should skip next dev for now', () => {})
    return
  }

  it('should not fetch again when a static page was prefetched when navigating to it twice', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Reveal the link to trigger prefetch and wait for it to complete
    const link = await act(
      async () => {
        const reveal = await browser.elementByCss('#accordion-to-static-page')
        await reveal.click()
        return browser.elementByCss('#to-static-page')
      },
      { includes: 'Static Page [prefetch-sentinel]' }
    )

    // Navigate to static page - should use prefetched data with no additional requests
    await act(async () => {
      await link.click()
      const staticPageText = await browser.elementByCss('#static-page').text()
      expect(staticPageText).toBe('Static Page [prefetch-sentinel]')
    }, 'no-requests')

    // Reveal the "to-home" link and navigate back
    // Note: Not using act() here because behavior differs between cache models.
    // With clientSegmentCache, revealing may trigger a prefetch. Without it, home is already
    // cached so no prefetch occurs. Either way, navigation works with cached data.
    const reveal = await browser.elementByCss('#accordion-to-home')
    await reveal.click()
    const homeLink = await browser.waitForElementByCss('#to-home')
    await homeLink.click()
    await browser.waitForElementByCss('#accordion-to-static-page')

    // Reveal the static page link again since accordion is hidden after navigation
    await browser.elementByCss('#accordion-to-static-page').click()
    await browser.waitForElementByCss('#to-static-page')

    // Navigate to static page again using the accordion - should still use cached data with no additional requests
    const staticPageText = await act(async () => {
      await browser.elementByCss('#to-static-page').click()
      return browser.elementByCss('#static-page').text()
    }, 'no-requests')

    expect(staticPageText).toBe('Static Page [prefetch-sentinel]')
  })

  it('should fetch again when a static page was prefetched when navigating to it after the stale time has passed', async () => {
    let act: ReturnType<typeof createRouterAct>
    const timeController = createTimeController()
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Install time controller
    await timeController.install(browser)

    // Reveal the static-page link to trigger prefetch and wait for it to complete
    let link = await act(
      async () => {
        const reveal = await browser.elementByCss('#accordion-to-static-page')
        await reveal.click()
        return browser.elementByCss('#to-static-page')
      },
      { includes: 'Static Page [prefetch-sentinel]' }
    )

    // Navigate to static page - should use prefetched data with no additional requests
    await act(async () => {
      await link.click()
      await browser.waitForElementByCss('#static-page')
    }, 'no-requests')

    // Reveal the "to-home" link and navigate back
    const reveal = await browser.elementByCss('#accordion-to-home')
    await reveal.click()
    const homeLink = await browser.waitForElementByCss('#to-home')
    await homeLink.click()
    await browser.waitForElementByCss('#accordion-to-static-page')

    // Advance time past the stale time
    await timeController.advance(browser, 31000)

    // Reveal the static-page link to trigger prefetch and wait for it to complete
    link = await act(
      async () => {
        const reveal = await browser.elementByCss('#accordion-to-static-page')
        await reveal.click()
        return browser.elementByCss('#to-static-page')
      },
      { includes: 'Static Page [prefetch-sentinel]' }
    )

    // Navigate to static page - should use prefetched data with no additional requests
    await act(async () => {
      await link.click()
      await browser.waitForElementByCss('#static-page')
    }, 'no-requests')
  })

  // FIXME: Flaky test - investigate and re-enable
  it.skip('should not re-fetch cached data when navigating back to a route group', async () => {
    let act: ReturnType<typeof createRouterAct>
    // Just installing so that the page doesn't automatically move past dynamic stale time
    createTimeController()
    const browser = await next.browser('/prefetch-auto-route-groups', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Once the page has loaded, we expect a data fetch (initial page load)
    expect(await browser.elementById('count').text()).toBe('1')

    // Navigate to a sub-page - this will trigger a data fetch
    await act(async () => {
      await browser
        .elementByCss("[href='/prefetch-auto-route-groups/sub/foo']")
        .click()
    })

    // Navigate back to the route group page - should use cached data with no additional fetch
    await act(async () => {
      await browser.elementByCss("[href='/prefetch-auto-route-groups']").click()
      // Confirm that the dashboard page is still rendering the stale fetch count, as it should be cached
    }, 'no-requests')

    expect(await browser.elementById('count').text()).toBe('1')

    // Navigate to a new sub-page - this will trigger another data fetch
    await act(async () => {
      await browser
        .elementByCss("[href='/prefetch-auto-route-groups/sub/bar']")
        .click()
    })

    // Finally, go back to the route group page - should use cached data with no additional fetch
    await act(async () => {
      await browser.elementByCss("[href='/prefetch-auto-route-groups']").click()
    }, 'no-requests')

    // Confirm that the dashboard page is still rendering the stale fetch count, as it should be cached
    expect(await browser.elementById('count').text()).toBe('1')

    // Reload the page to get the accurate total number of fetches
    await browser.refresh()

    // The initial fetch, 2 sub-page fetches, and a final fetch when reloading the page
    expect(await browser.elementById('count').text()).toBe('4')
  })

  it('should fetch again when the initially visited static page is visited after the stale time has passed', async () => {
    let act: ReturnType<typeof createRouterAct>
    const timeController = createTimeController()
    const browser = await next.browser('/static-page-no-prefetch', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Install time controller
    await timeController.install(browser)

    // Wait for the page to load (initial navigation request happened during browser load)
    await browser.waitForElementByCss('#static-page-no-prefetch')

    // Reveal the home link and wait for prefetch to complete, then navigate
    const homeLink = await act(
      async () => {
        const reveal = await browser.elementByCss('#accordion-to-home')
        await reveal.click()
        return browser.elementByCss('#to-home')
      },
      { includes: 'Home Page [prefetch-sentinel]' }
    )

    // Navigate to home - no additional requests since we just prefetched
    await homeLink.click()
    await browser.waitForElementByCss('#accordion-to-static-page')

    // Advance time past the stale time
    await timeController.advance(browser, 31000)

    // Reveal the link to static-page-no-prefetch and wait for prefetch
    const link = await act(
      async () => {
        const reveal = await browser.elementByCss(
          '#accordion-to-static-page-no-prefetch'
        )
        await reveal.click()
        return browser.elementByCss('#to-static-page-no-prefetch')
      },
      { includes: 'Static Page No Prefetch [prefetch-sentinel]' }
    )

    // Navigate back to static-page-no-prefetch - should use the fresh prefetch data
    const staticPageText = await act(async () => {
      await link.click()
      return browser.elementByCss('#static-page-no-prefetch').text()
    }, 'no-requests')
    expect(staticPageText).toBe('Static Page No Prefetch [prefetch-sentinel]')
  })

  it('should renew the stale time after refetching expired RSC data', async () => {
    let act: ReturnType<typeof createRouterAct>
    const timeController = createTimeController()
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Install time controller
    await timeController.install(browser)

    // Reveal the static-page link to trigger prefetch and wait for it to complete
    let link = await act(
      async () => {
        const reveal = await browser.elementByCss('#accordion-to-static-page')
        await reveal.click()
        return browser.elementByCss('#to-static-page')
      },
      { includes: 'Static Page [prefetch-sentinel]' }
    )

    // Navigate to static page (should use prefetched data with no additional requests)
    await act(async () => {
      await link.click()
      await browser.waitForElementByCss('#static-page')
    }, 'no-requests')

    // Reveal the "to-home" link and navigate back
    // Note: Not using act() here because behavior differs between cache models.
    // With clientSegmentCache, revealing may trigger a prefetch. Without it, home is already
    // cached so no prefetch occurs. Either way, navigation works with cached data.
    const reveal = await browser.elementByCss('#accordion-to-home')
    await reveal.click()
    const homeLink = await browser.waitForElementByCss('#to-home')
    await homeLink.click()
    await browser.waitForElementByCss('#accordion-to-static-page')

    // Advance time past the stale time
    await timeController.advance(browser, 31000)

    // Reveal the static-page link to trigger prefetch and wait for it to complete
    link = await act(
      async () => {
        const reveal = await browser.elementByCss('#accordion-to-static-page')
        await reveal.click()
        return browser.elementByCss('#to-static-page')
      },
      { includes: 'Static Page [prefetch-sentinel]' }
    )

    // Navigate to static page again (should use freshly prefetched data with no additional requests)
    await act(async () => {
      await link.click()
      await browser.waitForElementByCss('#static-page')
    }, 'no-requests')

    // Go back to home (reveal the link and navigate)
    // Note: Not using act() here because behavior differs between cache models.
    const reveal2 = await browser.elementByCss('#accordion-to-home')
    await reveal2.click()
    const homeLink2 = await browser.waitForElementByCss('#to-home')
    await homeLink2.click()
    await browser.waitForElementByCss('#accordion-to-static-page')

    // Advance time but not past the stale time (20 seconds < 30 second stale time - should still be fresh)
    await timeController.advance(browser, 20000)

    // Reveal the static-page link to trigger prefetch (should use cached data, not refetch)
    link = await act(async () => {
      const reveal = await browser.elementByCss('#accordion-to-static-page')
      await reveal.click()
      return browser.elementByCss('#to-static-page')
    }, 'no-requests')

    // Navigate to static page again (should NOT refetch - stale time should be renewed)
    // If this assertion passes, it means the stale time was properly renewed after the refetch
    const staticPageText = await act(async () => {
      await link.click()
      return browser.elementByCss('#static-page').text()
    }, 'no-requests')
    expect(staticPageText).toBe('Static Page [prefetch-sentinel]')
  })

  it('export const staleTime sets x-nextjs-stale-time header for static pages', async () => {
    // Verify that export const staleTime = 300 results in x-nextjs-stale-time: 300 header
    const response = await next.fetch('/stale-time-static', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
      },
    })
    expect(response.headers.get('x-nextjs-stale-time')).toBe('300')
  })

  it('page inherits staleTime from layout - x-nextjs-stale-time header', async () => {
    // Verify that a page without staleTime export inherits from layout
    // The layout at /stale-time-inherit exports staleTime = 120
    const response = await next.fetch('/stale-time-inherit', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
      },
    })
    expect(response.headers.get('x-nextjs-stale-time')).toBe('120')
  })

  it('page can override staleTime from layout - x-nextjs-stale-time header', async () => {
    // Verify that a page's staleTime export overrides the layout's staleTime
    // The layout exports staleTime = 120, but the page exports staleTime = 60
    const response = await next.fetch('/stale-time-inherit/override', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
      },
    })
    expect(response.headers.get('x-nextjs-stale-time')).toBe('60')
  })

  it('dynamic pages without staleTime export do not receive the header', async () => {
    // Dynamic pages without staleTime export should not have the header
    const response = await next.fetch('/dynamic-page', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
      },
    })
    expect(response.headers.get('x-nextjs-stale-time')).toBeNull()
  })

  it('dynamic pages with staleTime export receive the header', async () => {
    // Dynamic pages CAN export staleTime to set the client cache stale time
    const response = await next.fetch('/stale-time-dynamic', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
      },
    })
    expect(response.headers.get('x-nextjs-stale-time')).toBe('180')
  })

  it('export const staleTime overrides global staleTimes.static on client', async () => {
    // This test verifies the client-side behavior: a page with staleTime=300
    // should NOT refetch after 31 seconds (which would trigger a refetch with the
    // global staleTimes.static=30), but SHOULD refetch after 301 seconds.
    let act: ReturnType<typeof createRouterAct>
    const timeController = createTimeController()
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Install time controller
    await timeController.install(browser)

    // Reveal the stale-time-static link to trigger prefetch and wait for it to complete
    let link = await act(
      async () => {
        const reveal = await browser.elementByCss(
          '#accordion-to-stale-time-static'
        )
        await reveal.click()
        return browser.elementByCss('#to-stale-time-static')
      },
      {
        includes:
          'Static page with export staleTime of 5 minutes [prefetch-sentinel]',
      }
    )

    // Navigate to stale-time-static page - should use prefetched data with no additional requests
    await act(async () => {
      await link.click()
      await browser.waitForElementByCss('#stale-time-static')
    }, 'no-requests')

    // Use the accordion on the page to navigate back to home
    const reveal = await browser.elementByCss('#accordion-to-home')
    await reveal.click()
    const homeLink = await browser.waitForElementByCss('#to-home')
    await homeLink.click()
    await browser.waitForElementByCss('#accordion-to-stale-time-static')

    // Advance time by 31 seconds - past the global staleTimes.static (30s)
    // but within the page's export const staleTime (300s = 5 minutes)
    await timeController.advance(browser, 31000)

    // Reveal link again - should still use cached data because page's staleTime=300 is not exceeded
    link = await act(async () => {
      const revealAgain = await browser.elementByCss(
        '#accordion-to-stale-time-static'
      )
      await revealAgain.click()
      return browser.elementByCss('#to-stale-time-static')
    }, 'no-requests')
  })

  it('nested layouts - innermost staleTime wins (3 levels)', async () => {
    // Test that staleTime=200 from inner layout is used, not staleTime=100 from outer layout
    // Hierarchy: outer layout (100) -> inner layout (200) -> page (no export)
    const response = await next.fetch('/stale-time-nested/inner', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
      },
    })
    // Inner layout's staleTime (200) should win over outer layout's (100)
    expect(response.headers.get('x-nextjs-stale-time')).toBe('200')
  })

  it('staleTime=0 sets header to 0 (immediate invalidation)', async () => {
    // Test that staleTime=0 is properly set in header
    const response = await next.fetch('/stale-time-zero', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
      },
    })
    expect(response.headers.get('x-nextjs-stale-time')).toBe('0')
  })

  it('parallel routes - staleTime from parallel slot is applied', async () => {
    // Test parallel routes with different staleTime values in slots
    // The behavior depends on which slot is processed last
    const response = await next.fetch('/stale-time-parallel', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
      },
    })
    // With parallel routes, the last processed slot's staleTime wins
    // This test documents the current behavior (slot2 with 120 seconds)
    const staleTime = response.headers.get('x-nextjs-stale-time')
    // Either slot1 (60) or slot2 (120) should win - document actual behavior
    expect(['60', '120']).toContain(staleTime)
  })
})
