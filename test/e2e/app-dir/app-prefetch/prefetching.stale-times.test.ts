import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('app dir - prefetching (custom staleTime)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    nextConfig: {
      experimental: {
        staleTimes: {
          static: 30,
          dynamic: 20,
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
    await waitFor(30000)
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
})
