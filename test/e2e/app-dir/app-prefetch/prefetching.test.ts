import { createNextDescribe } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'

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

createNextDescribe(
  'app dir - prefetching',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
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
    })

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

      expect(
        requests.filter(
          (request) =>
            request === '/static-page' || request.includes(NEXT_RSC_UNION_QUERY)
        ).length
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
              request === '/static-page' ||
              request.includes(NEXT_RSC_UNION_QUERY)
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
      expect(prefetchResponse).not.toContain('Hello World')
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
      expect(prefetchResponse).not.toContain('Hello World')
      expect(prefetchResponse).toContain('Loading Prefetch Auto')
    })

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

      it('should not re-fetch cached data when navigating back to a route group', async () => {
        const browser = await next.browser('/prefetch-auto-route-groups')
        // once the page has loaded, we expect a data fetch
        expect(await browser.elementById('count').text()).toBe('1')

        // once navigating to a sub-page, we expect another data fetch
        await browser
          .elementByCss("[href='/prefetch-auto-route-groups/sub/foo']")
          .click()

        // navigating back to the route group page shouldn't trigger any data fetch
        await browser
          .elementByCss("[href='/prefetch-auto-route-groups']")
          .click()

        // confirm that the dashboard page is still rendering the stale fetch count, as it should be cached
        expect(await browser.elementById('count').text()).toBe('1')

        // navigating to a new sub-page, we expect another data fetch
        await browser
          .elementByCss("[href='/prefetch-auto-route-groups/sub/bar']")
          .click()

        // finally, going back to the route group page shouldn't trigger any data fetch
        await browser
          .elementByCss("[href='/prefetch-auto-route-groups']")
          .click()

        // confirm that the dashboard page is still rendering the stale fetch count, as it should be cached
        expect(await browser.elementById('count').text()).toBe('1')

        await browser.refresh()
        // reloading the page, we should now get an accurate total number of fetches
        // the initial fetch, 2 sub-page fetches, and a final fetch when reloading the page
        expect(await browser.elementById('count').text()).toBe('4')
      })
    })
  }
)
