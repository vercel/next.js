import { FileRef, nextTestSetup } from 'e2e-utils'
import { waitFor, retry } from 'next-test-utils'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param'
import { createRouterAct } from 'router-act'
import { createTimeController } from './test-utils'
import { join } from 'path'

const itHeaded = process.env.HEADLESS ? it.skip : it

describe('app dir - prefetching', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
    },
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
    let act: ReturnType<typeof createRouterAct>
    const timeController = createTimeController()
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    await timeController.install(browser)

    // Reveal the dashboard accordion and wait for prefetch to complete
    const dashboardLink = await act(
      async () => {
        const reveal = await browser.elementByCss('#accordion-to-dashboard')
        await reveal.click()
        await browser.waitForElementByCss('#to-dashboard')
        return await browser.elementByCss('#to-dashboard')
      },
      { includes: '[dashboard-prefetch-sentinel]' }
    )

    const before = Date.now()
    await dashboardLink.click()
    await browser.waitForElementByCss('#dashboard-layout')
    const after = Date.now()
    const timeToComplete = after - before

    expect(timeToComplete).toBeLessThan(1000)

    expect(await browser.elementByCss('#dashboard-layout').text()).toBe(
      'Dashboard Hello World'
    )

    await browser.waitForElementByCss('#dashboard-page')

    expect(await browser.waitForElementByCss('#dashboard-page').text()).toBe(
      'Welcome to the dashboard [dashboard-prefetch-sentinel]'
    )
  })

  it('should not have prefetch error for static path', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.next.router.prefetch("/dashboard/123")')
    await waitFor(3000)
    await browser.eval('window.next.router.push("/dashboard/123")')
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

  itHeaded('should not suppress prefetches after navigating back', async () => {
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

    await browser.eval('window.next.router.prefetch("/dashboard/123")')
    await browser.waitForIdleNetwork()

    expect(requests).toInclude('/dashboard/123')
  })

  it('should not fetch again when a static page was prefetched', async () => {
    let act: ReturnType<typeof createRouterAct>
    const timeController = createTimeController()
    const browser = await next.browser('/404', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    await browser.eval('location.href = "/"')
    await browser.waitForElementByCss('#accordion-to-static-page')
    await timeController.install(browser)

    // Reveal the static-page accordion to trigger prefetch
    await act(
      async () => {
        const reveal = await browser.elementByCss('#accordion-to-static-page')
        await reveal.click()
        await browser.waitForElementByCss('#to-static-page')
      },
      { includes: 'Static Page [prefetch-sentinel]' }
    )

    // Navigate to static page using cached prefetch
    await act(async () => {
      await browser.elementByCss('#to-static-page').click()
      await browser.waitForElementByCss('#static-page')
    }, 'no-requests')

    // Return to the home page - reveal accordion and navigate
    const reveal = await browser.elementByCss('#accordion-to-home')
    await reveal.click()
    const homeLink = await browser.waitForElementByCss('#to-home')

    await homeLink.click()
    await browser.waitForElementByCss('#accordion-to-static-page')

    // Reveal the static-page accordion again - should not trigger new prefetch (cache still fresh)
    await browser.elementByCss('#accordion-to-static-page').click()
    await browser.waitForElementByCss('#to-static-page')

    // Navigate to the static page again using cached data
    await act(async () => {
      await browser.elementByCss('#to-static-page').click()
      await browser.waitForElementByCss('#static-page')
    }, 'no-requests')
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

    // Reveal the static-page accordion
    await browser.elementByCss('#accordion-to-static-page').click()
    await browser.waitForElementByCss('#to-static-page')

    // Hover over the link - bot agents should not trigger prefetch
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
        rsc: '1',
        'next-router-prefetch': '1',
        'next-router-state-tree': stateTree,
        'next-url': '/prefetch-auto/justputit',
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

    const headers = {
      rsc: '1',
      'next-router-prefetch': '1',
      'next-router-state-tree': stateTree,
      'next-url': '/prefetch-auto/vercel',
    }

    const url = new URL('/prefetch-auto/justputit', 'http://localhost')
    const cacheBustingParam = computeCacheBustingSearchParam(
      headers['next-router-prefetch'] ? '1' : '0',
      undefined,
      headers['next-router-state-tree'],
      headers['next-url']
    )
    if (cacheBustingParam) {
      url.searchParams.set('_rsc', cacheBustingParam)
    }

    const response = await next.fetch(url.toString(), { headers })

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
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Reveal the accordion and wait for prefetch - should get loading state
    const link = await act(
      async () => {
        const reveal = await browser.elementByCss('#accordion-to-dynamic-page')
        await reveal.click()
        await browser.waitForElementByCss('#to-dynamic-page')
        return await browser.elementByCss('#to-dynamic-page')
      },
      { includes: 'Loading Prefetch Auto' }
    )

    // Click the link to navigate - should trigger dynamic data fetch
    await act(
      async () => {
        await link.click()
        await browser.waitForElementByCss('#loading-text')
        const loadingText = await browser.elementByCss('#loading-text').text()
        expect(loadingText).toBe('Loading Prefetch Auto')
      },
      { includes: 'prefetch-auto-page-data' }
    )

    // Wait for final data to appear
    await browser.waitForElementByCss('#prefetch-auto-page-data')
  })

  it('should not unintentionally modify the requested prefetch by escaping the uri encoded query params', async () => {
    const rscRequests = []
    const browser = await next.browser('/uri-encoded-prefetch', {
      beforePageLoad(page) {
        page.on('request', async (req) => {
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
        rscRequests.filter((req) => req.includes('/?param=with%20space')).length
      ).toBeGreaterThanOrEqual(1)
    })

    const initialRequestCount = rscRequests.filter((req) =>
      req.includes('/?param=with%20space')
    ).length

    // Click the link
    await browser.elementById('prefetch-via-link').click()

    // Assert that we're on the homepage (check for accordion since links are hidden)
    expect(
      await browser.hasElementByCssSelector('#accordion-to-dashboard')
    ).toBe(true)

    await browser.waitForIdleNetwork()

    // No new requests should be made since it is correctly prefetched
    await retry(async () => {
      expect(
        rscRequests.filter((req) => req.includes('/?param=with%20space')).length
      ).toBe(initialRequestCount)
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

          await retry(async () => {
            expect(await browser.hasElementByCssSelector('#sub-page')).toBe(
              true
            )
          })

          const newRandomNumber = await browser
            .elementById('random-number')
            .text()

          expect(initialRandomNumber).toBe(newRandomNumber)

          await retry(async () => {
            const logOccurrences =
              next.cliOutput.slice(logStartIndex).split('re-fetching in layout')
                .length - 1

            expect(logOccurrences).toBe(1)
          })
        })

        it('should update search params following a link click', async () => {
          const browser = await next.browser(`${basePath}/search-params`)
          await retry(async () => {
            const text = await browser.elementById('search-params-data').text()
            expect(text).toMatch(/{}/)
          })
          await browser.elementByCss('[href="?foo=true"]').click()
          await retry(async () => {
            const text = await browser.elementById('search-params-data').text()
            expect(text).toMatch(/{"foo":"true"}/)
          })
          await browser
            .elementByCss(`[href="${basePath}/search-params"]`)
            .click()
          await retry(async () => {
            const text = await browser.elementById('search-params-data').text()
            expect(text).toMatch(/{}/)
          })
          await browser.elementByCss('[href="?foo=true"]').click()
          await retry(async () => {
            const text = await browser.elementById('search-params-data').text()
            expect(text).toMatch(/{"foo":"true"}/)
          })
        })
      })
    })
  }

  describe('invalid URLs', () => {
    it('should not throw when an invalid URL is passed to Link', async () => {
      const browser = await next.browser('/invalid-url/from-link')

      await retry(async () => {
        expect(await browser.hasElementByCssSelector('h1')).toBe(true)
      })
      expect(await browser.elementByCss('h1').text()).toEqual('Hello, world!')
    })

    it('should throw when an invalid URL is passed to router.prefetch', async () => {
      const browser = await next.browser('/invalid-url/from-router-prefetch')

      await retry(async () => {
        expect(await browser.hasElementByCssSelector('h1')).toBe(true)
      })
      expect(await browser.elementByCss('h1').text()).toEqual(
        'A prefetch threw an error'
      )
    })
  })

  describe('fetch priority', () => {
    it('should prefetch links in viewport with low priority', async () => {
      const requests: { priority: string; url: string }[] = []
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          page.on('request', async (req) => {
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

      // Reveal an accordion to trigger prefetch
      await browser.elementByCss('#accordion-to-static-page').click()
      await browser.waitForIdleNetwork()

      await retry(async () => {
        const staticPageRequests = requests.filter(
          (req) => req.url === '/static-page'
        )
        expect(staticPageRequests.length).toBeGreaterThan(0)
        expect(staticPageRequests.every((req) => req.priority === 'low')).toBe(
          true
        )
      })
    })

    it('should have an auto priority for all other fetch operations', async () => {
      const requests: { priority: string; url: string }[] = []
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          page.on('request', async (req) => {
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

      // Reveal the dashboard accordion
      await browser.elementByCss('#accordion-to-dashboard').click()
      await browser.waitForElementByCss('#to-dashboard')

      // Click to navigate
      await browser.elementByCss('#to-dashboard').click()
      await browser.waitForIdleNetwork()

      await retry(async () => {
        const dashboardRequests = requests.filter(
          (req) => req.url === '/dashboard'
        )
        expect(dashboardRequests.length).toBeGreaterThanOrEqual(2)
        // Should have at least one low priority prefetch request
        expect(dashboardRequests.some((req) => req.priority === 'low')).toBe(
          true
        )
        // Should have at least one auto priority fetch to fill in missing data
        expect(dashboardRequests.some((req) => req.priority === 'auto')).toBe(
          true
        )
      })
    })

    it('should respect multiple prefetch types to the same URL', async () => {
      let interceptRequests = false

      const browser = await next.browser('/prefetch-race', {
        beforePageLoad(page) {
          page.route('**/force-dynamic/**', async (route) => {
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
