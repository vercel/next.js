import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('app dir - prefetching (custom staleTime)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    nextConfig: {
      experimental: {
        staleTimes: {
          static: 10,
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
    const browser = await next.browser('/404')
    let requests: string[] = []

    browser.on('request', (req) => {
      requests.push(new URL(req.url()).pathname)
    })
    await browser.eval('location.href = "/"')

    await retry(async () => {
      expect(
        requests.filter((request) => request === '/static-page')
      ).toHaveLength(1)
    })

    await browser
      .elementByCss('#to-static-page')
      .click()
      .waitForElementByCss('#static-page')

    await browser
      .elementByCss('#to-home')
      // Go back to home page
      .click()
      // Wait for homepage to load
      .waitForElementByCss('#to-static-page')
      // Click on the link to the static page again
      .click()
      // Wait for the static page to load again
      .waitForElementByCss('#static-page')

    await retry(async () => {
      expect(
        requests.filter((request) => request === '/static-page')
      ).toHaveLength(1)
    })
  })

  it('should fetch again when a static page was prefetched when navigating to it after the stale time has passed', async () => {
    const browser = await next.browser('/404')
    let requests: string[] = []

    browser.on('request', (req) => {
      requests.push(new URL(req.url()).pathname)
    })
    await browser.eval('location.href = "/"')

    await retry(async () => {
      expect(
        requests.filter((request) => request === '/static-page')
      ).toHaveLength(1)
    })

    await browser
      .elementByCss('#to-static-page')
      .click()
      .waitForElementByCss('#static-page')

    const linkToStaticPage = await browser
      .elementByCss('#to-home')
      // Go back to home page
      .click()
      // Wait for homepage to load
      .waitForElementByCss('#to-static-page')

    // Wait for the stale time to pass.
    await waitFor(10000)
    // Click on the link to the static page again
    await linkToStaticPage.click()
    // Wait for the static page to load again
    await browser.waitForElementByCss('#static-page')

    await retry(async () => {
      expect(
        requests.filter((request) => request === '/static-page')
      ).toHaveLength(2)
    })
  })

  it('should not re-fetch cached data when navigating back to a route group', async () => {
    const browser = await next.browser('/prefetch-auto-route-groups')
    // once the page has loaded, we expect a data fetch
    expect(await browser.elementById('count').text()).toBe('1')

    // once navigating to a sub-page, we expect another data fetch
    await browser
      .elementByCss("[href='/prefetch-auto-route-groups/sub/foo']")
      .click()

    // navigating back to the route group page shouldn't trigger any data fetch
    await browser.elementByCss("[href='/prefetch-auto-route-groups']").click()

    // confirm that the dashboard page is still rendering the stale fetch count, as it should be cached
    expect(await browser.elementById('count').text()).toBe('1')

    // navigating to a new sub-page, we expect another data fetch
    await browser
      .elementByCss("[href='/prefetch-auto-route-groups/sub/bar']")
      .click()

    // finally, going back to the route group page shouldn't trigger any data fetch
    await browser.elementByCss("[href='/prefetch-auto-route-groups']").click()

    // confirm that the dashboard page is still rendering the stale fetch count, as it should be cached
    expect(await browser.elementById('count').text()).toBe('1')

    await browser.refresh()
    // reloading the page, we should now get an accurate total number of fetches
    // the initial fetch, 2 sub-page fetches, and a final fetch when reloading the page
    expect(await browser.elementById('count').text()).toBe('4')
  })

  it('should fetch again when the initially visited static page is visited after the stale time has passed', async () => {
    const browser = await next.browser('/404')
    let requests: string[] = []

    browser.on('request', (req) => {
      const path = new URL(req.url()).pathname
      const headers = req.headers()

      if (headers['rsc']) {
        requests.push(path)
      }
    })

    await browser.eval('location.href = "/static-page-no-prefetch"')

    await browser
      .elementByCss('#to-home')
      .click()
      .waitForElementByCss('#to-static-page')

    // Wait for the stale time to pass.
    await waitFor(10000)

    await browser.elementByCss('#to-static-page-no-prefetch').click()

    // Wait for the static page to load again
    await browser.waitForElementByCss('#static-page-no-prefetch')

    await retry(async () => {
      expect(
        requests.filter((request) => request === '/static-page-no-prefetch')
      ).toHaveLength(1)
    })
  })

  it('should renew the stale time after refetching expired RSC data', async () => {
    const browser = await next.browser('/404')
    let requests: string[] = []

    browser.on('request', (req) => {
      requests.push(new URL(req.url()).pathname)
    })

    // Navigate to home and wait for static page to be prefetched
    await browser.eval('location.href = "/"')

    await retry(async () => {
      expect(
        requests.filter((request) => request === '/static-page')
      ).toHaveLength(1)
    })

    // Navigate to static page (should use cached data)
    await browser
      .elementByCss('#to-static-page')
      .click()
      .waitForElementByCss('#static-page')

    // Go back to home
    await browser
      .elementByCss('#to-home')
      .click()
      .waitForElementByCss('#to-static-page')

    // Wait for stale time to expire (10 seconds)
    await waitFor(10000)

    // Navigate to static page again (should refetch due to expired cache)
    await browser
      .elementByCss('#to-static-page')
      .click()
      .waitForElementByCss('#static-page')

    // Verify that refetch happened
    await retry(async () => {
      expect(
        requests.filter((request) => request === '/static-page')
      ).toHaveLength(2)
    })

    // Go back to home
    await browser
      .elementByCss('#to-home')
      .click()
      .waitForElementByCss('#to-static-page')

    // Wait less than the stale time (5 seconds - should still be fresh)
    await waitFor(5000)

    // Navigate to static page again (should NOT refetch - stale time should be renewed)
    await browser
      .elementByCss('#to-static-page')
      .click()
      .waitForElementByCss('#static-page')

    // This should still be 2 - no new request should have been made
    // If this fails, it means the stale time was not renewed after the refetch
    await retry(async () => {
      expect(
        requests.filter((request) => request === '/static-page')
      ).toHaveLength(2)
    })
  })
})
