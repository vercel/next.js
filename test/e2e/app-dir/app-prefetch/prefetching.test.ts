import { nextTestSetup } from 'e2e-utils'
import { check, waitFor, retry } from 'next-test-utils'
import type { Page, Request, Route } from 'playwright'
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

describe('app dir - prefetching', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  // TODO: re-enable for dev after https://vercel.slack.com/archives/C035J346QQL/p1663822388387959 is resolved (Sep 22nd 2022)
  if (isNextDev) {
    it('should skip next dev for now', () => {})
    return
  }

  it('NEXT_RSC_UNION_QUERY query name is _rsc', async () => {
    expect(NEXT_RSC_UNION_QUERY).toBe('_rsc')
  })

  it('should show layout eagerly when prefetched with loading one level down', async () => {
    const browser = await next.browser('/', browserConfigWithFixedTime)
    // Ensure the page is prefetched
    await waitFor(1000)

    const before = Date.now()
    await browser
      .elementByCss('#to-dashboard')
      .click()
      .waitForElementByCss('#dashboard-layout')
    const after = Date.now()
    const timeToComplete = after - before

    expect(timeToComplete).toBeLessThan(1000)

    expect(await browser.elementByCss('#dashboard-layout').text()).toBe(
      'Dashboard Hello World'
    )

    await browser.waitForElementByCss('#dashboard-page')

    expect(await browser.waitForElementByCss('#dashboard-page').text()).toBe(
      'Welcome to the dashboard'
    )
  })

  it('should not have prefetch error for static path', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.nd.router.prefetch("/dashboard/123")')
    await waitFor(3000)
    await browser.eval('window.nd.router.push("/dashboard/123")')
    expect(next.cliOutput).not.toContain('ReferenceError')
    expect(next.cliOutput).not.toContain('is not defined')
  })

  it('should not have prefetch error when reloading before prefetch request is finished', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.next.router.prefetch("/dashboard/123")')
    await browser.refresh()
    const logs = await browser.log()

    expect(logs).not.toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Failed to fetch RSC payload'),
        }),
      ])
    )
  })

  it('should not suppress prefetches after navigating back', async () => {
    if (!process.env.CI && process.env.HEADLESS) {
      console.warn('This test can only run in headed mode. Skipping...')
      return
    }

    // Force headed mode, as bfcache is not available in headless mode.
    const browser = await next.browser('/', { headless: false })

    // Trigger a hard navigation.
    await browser.elementById('to-static-page-hard').click()

    // Go back, utilizing the bfcache.
    await browser.elementById('go-back').click()

    let requests: string[] = []
    browser.on('request', (req) => {
      requests.push(new URL(req.url()).pathname)
    })

    await browser.evalAsync('window.next.router.prefetch("/dashboard/123")')
    await browser.waitForIdleNetwork()

    expect(requests).toInclude('/dashboard/123')
  })

  it('should not fetch again when a static page was prefetched', async () => {
    const browser = await next.browser('/404', browserConfigWithFixedTime)
    let requests: string[] = []

    browser.on('request', (req) => {
      requests.push(new URL(req.url()).pathname)
    })
    await browser.eval('location.href = "/"')

    await browser.eval(
      'window.nd.router.prefetch("/static-page", {kind: "auto"})'
    )

    await check(() => {
      return requests.some(
        (req) =>
          req.includes('static-page') && !req.includes(NEXT_RSC_UNION_QUERY)
      )
        ? 'success'
        : JSON.stringify(requests)
    }, 'success')

    await browser
      .elementByCss('#to-static-page')
      .click()
      .waitForElementByCss('#static-page')

    expect(
      requests.filter((request) => request === '/static-page').length
    ).toBe(1)

    // return to the home page
    await browser.elementByCss('#to-home').click()
    await browser.waitForElementByCss('#to-static-page')
    // there shouldn't be any additional prefetches
    expect(
      requests.filter((request) => request === '/static-page').length
    ).toBe(1)

    // navigate to the static page again
    await browser.elementByCss('#to-static-page').click()
    await browser.waitForElementByCss('#static-page')

    // there still should only be the initial request to the static page
    expect(
      requests.filter((request) => request === '/static-page').length
    ).toBe(1)
  })

  it('should calculate `_rsc` query based on `Next-Url`', async () => {
    const browser = await next.browser('/404', browserConfigWithFixedTime)
    let staticPageRequests: string[] = []

    browser.on('request', (req) => {
      const url = new URL(req.url())
      if (url.toString().includes(`/static-page?${NEXT_RSC_UNION_QUERY}=`)) {
        staticPageRequests.push(`${url.pathname}${url.search}`)
      }
    })
    await browser.eval('location.href = "/"')
    await browser.eval(
      `window.nd.router.prefetch("/static-page", {kind: "auto"})`
    )
    await check(() => {
      return staticPageRequests.length === 1
        ? 'success'
        : JSON.stringify(staticPageRequests)
    }, 'success')

    // Unable to clear router cache so mpa navigation
    await browser.eval('location.href = "/dashboard"')
    await browser.eval(
      `window.nd.router.prefetch("/static-page", {kind: "auto"})`
    )
    await check(() => {
      return staticPageRequests.length === 2
        ? 'success'
        : JSON.stringify(staticPageRequests)
    }, 'success')

    expect(staticPageRequests[0]).toMatch('/static-page?_rsc=')
    expect(staticPageRequests[1]).toMatch('/static-page?_rsc=')
    // `_rsc` does not match because it depends on the `Next-Url`
    expect(staticPageRequests[0]).not.toBe(staticPageRequests[1])
  })

  it('should not prefetch for a bot user agent', async () => {
    const browser = await next.browser('/404')
    let requests: string[] = []

    browser.on('request', (req) => {
      requests.push(new URL(req.url()).pathname)
    })
    await browser.eval(
      `location.href = "/?useragent=${encodeURIComponent(
        'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      )}"`
    )

    await browser.elementByCss('#to-static-page').moveTo()

    // check five times to ensure prefetch didn't occur
    for (let i = 0; i < 5; i++) {
      await waitFor(500)
      expect(
        requests.filter(
          (request) =>
            request === '/static-page' || request.includes(NEXT_RSC_UNION_QUERY)
        ).length
      ).toBe(0)
    }
  })

  it('should navigate when prefetch is false', async () => {
    const browser = await next.browser('/prefetch-false/initial')
    await browser
      .elementByCss('#to-prefetch-false-result')
      .click()
      .waitForElementByCss('#prefetch-false-page-result')

    expect(
      await browser.elementByCss('#prefetch-false-page-result').text()
    ).toBe('Result page')
  })

  it('should not need to prefetch the layout if the prefetch is initiated at the same segment', async () => {
    const stateTree = encodeURIComponent(
      JSON.stringify([
        '',
        {
          children: [
            'prefetch-auto',
            {
              children: [
                ['slug', 'justputit', 'd'],
                { children: ['__PAGE__', {}] },
              ],
            },
          ],
        },
        null,
        null,
        true,
      ])
    )
    const response = await next.fetch(`/prefetch-auto/justputit?_rsc=dcqtr`, {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-State-Tree': stateTree,
        'Next-Url': '/prefetch-auto/justputit',
      },
    })

    const prefetchResponse = await response.text()
    expect(prefetchResponse).not.toContain('Page Data!')
    expect(prefetchResponse).not.toContain('Layout Data!')
    expect(prefetchResponse).not.toContain('Loading Prefetch Auto')
  })

  it('should only prefetch the loading state and not the component tree when prefetching at the same segment', async () => {
    const stateTree = encodeURIComponent(
      JSON.stringify([
        '',
        {
          children: [
            'prefetch-auto',
            {
              children: [
                ['slug', 'vercel', 'd'],
                { children: ['__PAGE__', {}] },
              ],
            },
          ],
        },
        null,
        null,
        true,
      ])
    )
    const response = await next.fetch(`/prefetch-auto/justputit?_rsc=dcqtr`, {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-State-Tree': stateTree,
        'Next-Url': '/prefetch-auto/vercel',
      },
    })

    const prefetchResponse = await response.text()
    expect(prefetchResponse).not.toContain('Page Data!')
    expect(prefetchResponse).toContain('Loading Prefetch Auto')
  })

  it('should not re-render error component when triggering a prefetch action', async () => {
    const browser = await next.browser('/with-error')

    const initialRandom = await browser
      .elementByCss('button')
      .click()
      .waitForElementByCss('#random-number')
      .text()

    await browser.eval('window.next.router.prefetch("/")')

    // confirm the error component was not re-rendered
    expect(await browser.elementById('random-number').text()).toBe(
      initialRandom
    )
  })

  it('should immediately render the loading state for a dynamic segment when fetched from higher up in the tree', async () => {
    const browser = await next.browser('/')
    const loadingText = await browser
      .elementById('to-dynamic-page')
      .click()
      .waitForElementByCss('#loading-text')
      .text()

    expect(loadingText).toBe('Loading Prefetch Auto')

    await browser.waitForElementByCss('#prefetch-auto-page-data')
  })

  it('should not unintentionally modify the requested prefetch by escaping the uri encoded query params', async () => {
    const rscRequests = []
    const browser = await next.browser('/uri-encoded-prefetch', {
      beforePageLoad(page: Page) {
        page.on('request', async (req: Request) => {
          const url = new URL(req.url())
          if (url.searchParams.has('_rsc')) {
            rscRequests.push(url.pathname + url.search)
          }
        })
      },
    })

    // sanity check: the link should be present
    expect(await browser.elementById('prefetch-via-link')).toBeDefined()

    await browser.waitForIdleNetwork()

    // The space encoding of the prefetch request should be the same as the href, and should not be replaced with a +
    await retry(async () => {
      expect(
        rscRequests.filter((req) => req.includes('/?param=with%20space'))
      ).toHaveLength(1)
    })

    // Click the link
    await browser.elementById('prefetch-via-link').click()

    // Assert that we're on the homepage
    expect(await browser.hasElementByCssSelector('#to-dashboard')).toBe(true)

    await browser.waitForIdleNetwork()

    // No new requests should be made since it is correctly prefetched
    await retry(async () => {
      expect(
        rscRequests.filter((req) => req.includes('/?param=with%20space'))
      ).toHaveLength(1)
    })
  })

  describe('prefetch cache seeding', () => {
    it('should not re-fetch the initial static page if the same page is prefetched with prefetch={true}', async () => {
      const rscRequests = []
      const browser = await next.browser('/static-page', {
        beforePageLoad(page: Page) {
          page.on('request', async (req: Request) => {
            const url = new URL(req.url())
            if (url.pathname === '/static-page' || url.pathname === '/') {
              const headers = await req.allHeaders()
              if (headers['rsc']) {
                rscRequests.push(url.pathname)
              }
            }
          })
        },
      })

      expect(
        await browser.hasElementByCssSelector('[href="/static-page"]')
      ).toBe(true)

      // sanity check: we should see a prefetch request to the root page
      await retry(async () => {
        expect(rscRequests.filter((req) => req === '/').length).toBe(1)
      })

      // We shouldn't see any requests to the static page since the prefetch cache was seeded as part of the SSR render
      await retry(async () => {
        expect(rscRequests.filter((req) => req === '/static-page').length).toBe(
          0
        )
      })

      // navigate to index
      await browser.elementByCss('[href="/"]').click()

      // we should be on the index page
      await browser.waitForElementByCss('#to-dashboard')

      // navigate to the static page
      await browser.elementByCss('[href="/static-page"]').click()

      // we should be on the static page
      await browser.waitForElementByCss('#static-page')

      await browser.waitForIdleNetwork()

      // We still shouldn't see any requests since it respects the static staletime (default 5m)
      await retry(async () => {
        expect(rscRequests.filter((req) => req === '/static-page').length).toBe(
          0
        )
      })
    })

    it('should not re-fetch the initial dynamic page if the same page is prefetched with prefetch={true}', async () => {
      const rscRequests = []
      const browser = await next.browser('/dynamic-page', {
        beforePageLoad(page: Page) {
          page.on('request', async (req: Request) => {
            const url = new URL(req.url())
            if (url.pathname === '/dynamic-page' || url.pathname === '/') {
              const headers = await req.allHeaders()
              if (headers['rsc']) {
                rscRequests.push(url.pathname)
              }
            }
          })
        },
      })

      expect(
        await browser.hasElementByCssSelector('[href="/dynamic-page"]')
      ).toBe(true)

      // sanity check: we should see a prefetch request to the root page
      await retry(async () => {
        expect(rscRequests.filter((req) => req === '/').length).toBe(1)
      })

      // We shouldn't see any requests to the dynamic page since the prefetch cache was seeded as part of the SSR render
      await retry(async () => {
        expect(
          rscRequests.filter((req) => req === '/dynamic-page').length
        ).toBe(0)
      })

      // navigate to index
      await browser.elementByCss('[href="/"]').click()

      // we should be on the index page
      await browser.waitForElementByCss('#to-dashboard')

      // navigate to the dynamic page
      await browser.elementByCss('[href="/dynamic-page"]').click()

      // we should be on the dynamic page
      await browser.waitForElementByCss('#dynamic-page')

      await browser.waitForIdleNetwork()

      // We should see a request for the dynamic page since it respects the dynamic staletime (default 0)
      await retry(async () => {
        expect(
          rscRequests.filter((req) => req === '/dynamic-page').length
        ).toBe(1)
      })
    })
  })

  // These tests are skipped when deployed as they rely on runtime logs
  if (!isNextDeploy) {
    describe('dynamic rendering', () => {
      describe.each(['/force-dynamic', '/revalidate-0'])('%s', (basePath) => {
        it('should not re-render layout when navigating between sub-pages', async () => {
          const logStartIndex = next.cliOutput.length

          const browser = await next.browser(`${basePath}/test-page`)
          let initialRandomNumber = await browser
            .elementById('random-number')
            .text()
          await browser
            .elementByCss(`[href="${basePath}/test-page/sub-page"]`)
            .click()

          await check(() => browser.hasElementByCssSelector('#sub-page'), true)

          const newRandomNumber = await browser
            .elementById('random-number')
            .text()

          expect(initialRandomNumber).toBe(newRandomNumber)

          await check(() => {
            const logOccurrences =
              next.cliOutput.slice(logStartIndex).split('re-fetching in layout')
                .length - 1

            return logOccurrences
          }, 1)
        })

        it('should update search params following a link click', async () => {
          const browser = await next.browser(`${basePath}/search-params`)
          await check(
            () => browser.elementById('search-params-data').text(),
            /{}/
          )
          await browser.elementByCss('[href="?foo=true"]').click()
          await check(
            () => browser.elementById('search-params-data').text(),
            /{"foo":"true"}/
          )
          await browser
            .elementByCss(`[href="${basePath}/search-params"]`)
            .click()
          await check(
            () => browser.elementById('search-params-data').text(),
            /{}/
          )
          await browser.elementByCss('[href="?foo=true"]').click()
          await check(
            () => browser.elementById('search-params-data').text(),
            /{"foo":"true"}/
          )
        })
      })
    })
  }

  describe('invalid URLs', () => {
    it('should not throw when an invalid URL is passed to Link', async () => {
      const browser = await next.browser('/invalid-url/from-link')

      await check(() => browser.hasElementByCssSelector('h1'), true)
      expect(await browser.elementByCss('h1').text()).toEqual('Hello, world!')
    })

    it('should throw when an invalid URL is passed to router.prefetch', async () => {
      const browser = await next.browser('/invalid-url/from-router-prefetch')

      await check(() => browser.hasElementByCssSelector('h1'), true)
      expect(await browser.elementByCss('h1').text()).toEqual(
        'A prefetch threw an error'
      )
    })
  })

  describe('fetch priority', () => {
    it('should prefetch links in viewport with low priority', async () => {
      const requests: { priority: string; url: string }[] = []
      const browser = await next.browser('/', {
        beforePageLoad(page: Page) {
          page.on('request', async (req: Request) => {
            const url = new URL(req.url())
            const headers = await req.allHeaders()
            if (headers['rsc']) {
              requests.push({
                priority: headers['next-test-fetch-priority'],
                url: url.pathname,
              })
            }
          })
        },
      })

      await browser.waitForIdleNetwork()

      await retry(async () => {
        expect(requests.length).toBeGreaterThan(0)
        expect(requests.every((req) => req.priority === 'low')).toBe(true)
      })
    })

    it('should prefetch with high priority when navigating to a page without a prefetch entry', async () => {
      const requests: { priority: string; url: string }[] = []
      const browser = await next.browser('/prefetch-false/initial', {
        beforePageLoad(page: Page) {
          page.on('request', async (req: Request) => {
            const url = new URL(req.url())
            const headers = await req.allHeaders()
            if (headers['rsc']) {
              requests.push({
                priority: headers['next-test-fetch-priority'],
                url: url.pathname,
              })
            }
          })
        },
      })

      await browser.waitForIdleNetwork()

      expect(requests.length).toBe(0)

      await browser.elementByCss('#to-prefetch-false-result').click()
      await retry(async () => {
        expect(requests.length).toBe(1)
        expect(requests[0].priority).toBe('high')
      })
    })

    it('should have an auto priority for all other fetch operations', async () => {
      const requests: { priority: string; url: string }[] = []
      const browser = await next.browser('/', {
        beforePageLoad(page: Page) {
          page.on('request', async (req: Request) => {
            const url = new URL(req.url())
            const headers = await req.allHeaders()
            if (headers['rsc']) {
              requests.push({
                priority: headers['next-test-fetch-priority'],
                url: url.pathname,
              })
            }
          })
        },
      })

      await browser.elementByCss('#to-dashboard').click()
      await browser.waitForIdleNetwork()

      await retry(async () => {
        const dashboardRequests = requests.filter(
          (req) => req.url === '/dashboard'
        )
        expect(dashboardRequests.length).toBe(2)
        expect(dashboardRequests[0].priority).toBe('low') // the first request is the prefetch
        expect(dashboardRequests[1].priority).toBe('auto') // the second request is the lazy fetch to fill in missing data
      })
    })

    it('should respect multiple prefetch types to the same URL', async () => {
      let interceptRequests = false

      const browser = await next.browser('/prefetch-race', {
        beforePageLoad(page: Page) {
          page.route('**/force-dynamic/**', async (route: Route) => {
            if (!interceptRequests) {
              return route.continue()
            }

            const request = route.request()
            const headers = await request.allHeaders()

            if (headers['rsc'] === '1') {
              // intentionally stall the request,
              // as after the initial page load, there shouldn't be any additional fetches
              // since the data should already be available.
            } else {
              await route.continue()
            }
          })
        },
      })

      await browser.waitForIdleNetwork()
      interceptRequests = true

      await browser.elementByCss('[href="/force-dynamic/test-page"]').click()
      await browser.waitForElementByCss('#test-page')
    })
  })
})
