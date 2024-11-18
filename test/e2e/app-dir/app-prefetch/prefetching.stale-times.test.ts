import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'

const browserConfigWithFixedTime = {
  beforePageLoad: (page) => {
    page.addInitScript(() => {
      const startTime = new Date()
      const fixedTime = new Date('2023-04-17T00:00:00Z')

      // Override the Date constructor
      // @ts-ignore
      // eslint-disable-next-line no-native-reassign
      Date = class extends Date {
        constructor() {
          super()
          // @ts-ignore
          return new startTime.constructor(fixedTime)
        }

        static now() {
          return fixedTime.getTime()
        }
      }
    })
  },
}

describe('app dir - prefetching (custom staleTime)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    nextConfig: {
      experimental: {
        staleTimes: {
          static: 180,
          dynamic: 30,
        },
      },
    },
  })

  if (isNextDev) {
    it('should skip next dev for now', () => {})
    return
  }

  it('should not fetch again when a static page was prefetched when navigating to it twice', async () => {
    const browser = await next.browser('/404', browserConfigWithFixedTime)
    let requests: string[] = []

    browser.on('request', (req) => {
      requests.push(new URL(req.url()).pathname)
    })
    await browser.eval('location.href = "/"')

    await browser.eval(
      `window.nd.router.prefetch("/static-page", {kind: "auto"})`
    )

    await retry(async () => {
      expect(
        requests.filter(
          (request) =>
            request === '/static-page' || request.includes(NEXT_RSC_UNION_QUERY)
        ).length
      ).toBe(1)
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
        requests.filter(
          (request) =>
            request === '/static-page' || request.includes(NEXT_RSC_UNION_QUERY)
        ).length
      ).toBe(1)
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
