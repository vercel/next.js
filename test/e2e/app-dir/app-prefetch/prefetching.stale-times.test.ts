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
        await browser.waitForElementByCss('#to-static-page')
        return await browser.elementByCss('#to-static-page')
      },
      { includes: 'Static Page [prefetch-sentinel]' }
    )

    // Navigate to static page - should use prefetched data with no additional requests
    await act(async () => {
      await link.click()
      await browser.waitForElementByCss('#static-page')
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
    await act(async () => {
      await browser.elementByCss('#to-static-page').click()
      await browser.waitForElementByCss('#static-page')
      const staticPageText = await browser.elementByCss('#static-page').text()
      expect(staticPageText).toBe('Static Page [prefetch-sentinel]')
    }, 'no-requests')
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
        await browser.waitForElementByCss('#to-static-page')
        return await browser.elementByCss('#to-static-page')
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
        await browser.waitForElementByCss('#to-static-page')
        return await browser.elementByCss('#to-static-page')
      },
      { includes: 'Static Page [prefetch-sentinel]' }
    )

    // Navigate to static page - should use prefetched data with no additional requests
    await act(async () => {
      await link.click()
      await browser.waitForElementByCss('#static-page')
    }, 'no-requests')
  })

  it('should not re-fetch cached data when navigating back to a route group', async () => {
    let act: ReturnType<typeof createRouterAct>
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
      expect(await browser.elementById('count').text()).toBe('1')
    }, 'no-requests')

    // Navigate to a new sub-page - this will trigger another data fetch
    await act(async () => {
      await browser
        .elementByCss("[href='/prefetch-auto-route-groups/sub/bar']")
        .click()
    })

    // Finally, go back to the route group page - should use cached data with no additional fetch
    await act(async () => {
      await browser.elementByCss("[href='/prefetch-auto-route-groups']").click()
      // Confirm that the dashboard page is still rendering the stale fetch count, as it should be cached
      expect(await browser.elementById('count').text()).toBe('1')
    }, 'no-requests')

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
        await browser.waitForElementByCss('#to-home')
        return await browser.elementByCss('#to-home')
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
        await browser.waitForElementByCss('#to-static-page-no-prefetch')
        return await browser.elementByCss('#to-static-page-no-prefetch')
      },
      { includes: 'Static Page No Prefetch [prefetch-sentinel]' }
    )

    // Navigate back to static-page-no-prefetch - should use the fresh prefetch data
    await act(async () => {
      await link.click()
      await browser.waitForElementByCss('#static-page-no-prefetch')
      const staticPageText = await browser
        .elementByCss('#static-page-no-prefetch')
        .text()
      expect(staticPageText).toBe('Static Page No Prefetch [prefetch-sentinel]')
    }, 'no-requests')
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
        await browser.waitForElementByCss('#to-static-page')
        return await browser.elementByCss('#to-static-page')
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
        await browser.waitForElementByCss('#to-static-page')
        return await browser.elementByCss('#to-static-page')
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
      await browser.waitForElementByCss('#to-static-page')
      return await browser.elementByCss('#to-static-page')
    }, 'no-requests')

    // Navigate to static page again (should NOT refetch - stale time should be renewed)
    // If this assertion passes, it means the stale time was properly renewed after the refetch
    await act(async () => {
      await link.click()
      await browser.waitForElementByCss('#static-page')
      const staticPageText = await browser.elementByCss('#static-page').text()
      expect(staticPageText).toBe('Static Page [prefetch-sentinel]')
    }, 'no-requests')
  })
})
