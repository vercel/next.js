import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import type { Request, Response } from 'playwright'

describe('app dir - navigation', () => {
  const { next, isNextDev, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  describe('query string', () => {
    it('should set query correctly', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementById('query').text()).toMatchInlineSnapshot(
        `""`
      )

      await browser.elementById('set-query').click()

      await retry(() =>
        expect(browser.elementById('query').text()).resolves.toEqual('a=b&c=d')
      )

      const url = new URL(await browser.url())
      expect(url.searchParams.toString()).toMatchInlineSnapshot(`"a=b&c=d"`)
    })

    it('should set query with semicolon correctly', async () => {
      const browser = await next.browser('/redirect/semicolon')

      await retry(() =>
        expect(browser.elementById('query').text()).resolves.toEqual('a=b%3Bc')
      )

      const url = new URL(await browser.url())
      expect(url.searchParams.toString()).toBe('a=b%3Bc')
    })

    it('should handle unicode search params', async () => {
      const requests: Array<{
        pathname: string
        ok: boolean
        headers: Record<string, string>
      }> = []

      const browser = await next.browser('/search-params?name=名', {
        beforePageLoad(page) {
          page.on('response', async (res: Response) => {
            requests.push({
              pathname: new URL(res.url()).pathname,
              ok: res.ok(),
              headers: res.headers(),
            })
          })
        },
      })

      expect(await browser.elementById('name').text()).toBe('名')
      await browser.elementById('link').click()
      await browser.waitForElementByCss('#set-query')

      await retry(() =>
        expect(requests).toContainEqual({
          pathname: '/',
          ok: true,
          headers: expect.objectContaining({
            'content-type': 'text/x-component',
          }),
        })
      )
    })

    it('should not reset shallow url updates on prefetch', async () => {
      const browser = await next.browser('/search-params/shallow')
      const button = await browser.elementByCss('button')
      await button.click()
      expect(await browser.url()).toMatch(/\?foo=bar$/)
      const link = await browser.elementByCss('a')
      await link.hover()
      // Hovering a prefetch link should keep the URL intact
      expect(await browser.url()).toMatch(/\?foo=bar$/)
    })

    describe('useParams identity between renders', () => {
      it.each([
        {
          router: 'app',
          pathname: '/search-params/foo',
          // App Router doesn't re-render on initial load (the params are baked
          // server side). In development, effects will render twice.

          // TODO: modern StrictMode does not double invoke effects during hydration: https://github.com/facebook/react/pull/28951
          waitForNEffects: 1,
        },
        {
          router: 'pages',
          pathname: '/search-params-pages/foo',
          // Pages Router re-renders on initial load and after hydration, the
          // params when initially loaded are null.
          waitForNEffects: 2,
        },
      ])(
        'should be stable in $router',
        async ({ pathname, waitForNEffects }) => {
          const browser = await next.browser(pathname)

          // Expect to see the params changed message at least twice.
          let lastLogIndex = await retry(async () => {
            const logs: Array<{ message: string }> = await browser.log()

            expect(
              logs.filter(({ message }) => message === 'params changed')
            ).toHaveLength(waitForNEffects)

            return logs.length
          })

          await browser.elementById('rerender-button').click()
          await browser.elementById('rerender-button').click()
          await browser.elementById('rerender-button').click()

          await retry(async () => {
            const rerender = await browser.elementById('rerender-button').text()

            expect(rerender).toBe('Re-Render 3')
          })

          let logs: Array<{ message: string }> = await browser.log()
          expect(logs.slice(lastLogIndex)).not.toContainEqual(
            expect.objectContaining({
              message: 'params changed',
            })
          )

          lastLogIndex = logs.length

          await browser.elementById('change-params-button').click()

          await retry(async () => {
            logs = await browser.log()

            expect(logs.slice(lastLogIndex)).toContainEqual(
              expect.objectContaining({
                message: 'params changed',
              })
            )
          })
        }
      )
    })
  })

  describe('hash', () => {
    it('should scroll to the specified hash', async () => {
      let hasRscRequest = false
      const browser = await next.browser('/hash', {
        beforePageLoad(page) {
          page.on('request', async (req) => {
            const headers = await req.allHeaders()
            if (headers['rsc']) {
              hasRscRequest = true
            }
          })
        },
      })

      const checkLink = async (
        val: number | string,
        expectedScroll: number
      ) => {
        await browser.elementByCss(`#link-to-${val.toString()}`).click()

        await retry(() =>
          expect(browser.eval('window.pageYOffset')).resolves.toEqual(
            expectedScroll
          )
        )
      }

      if (isNextStart || isNextDeploy) {
        await browser.waitForIdleNetwork()
      }

      // Wait for all network requests to finish, and then initialize the flag
      // used to determine if any RSC requests are made
      hasRscRequest = false

      await checkLink(6, 128)
      await checkLink(50, 744)
      await checkLink(160, 2284)
      await checkLink(300, 4244)
      await checkLink(500, 7044) // this one is hash only (`href="#hash-500"`)
      await checkLink('top', 0)
      await checkLink('non-existent', 0)

      if (!isNextDev) {
        // there should have been no RSC calls to fetch data
        // this is skipped in development because there'll never be a prefetch cache
        // entry for the loaded page and so every request will be a cache miss.
        expect(hasRscRequest).toBe(false)
      }

      await checkLink('query-param', 2284)
      await browser.waitForIdleNetwork()

      // There should be an RSC request if the query param is changed
      expect(hasRscRequest).toBe(true)
    })

    it('should not scroll to hash when scroll={false} is set', async () => {
      const browser = await next.browser('/hash-changes')
      const curScroll = await browser.eval('document.documentElement.scrollTop')
      await browser.elementByCss('#scroll-to-name-item-400-no-scroll').click()
      expect(curScroll).toBe(
        await browser.eval('document.documentElement.scrollTop')
      )
    })
  })

  describe('hash-with-scroll-offset', () => {
    it('should scroll to the specified hash', async () => {
      const browser = await next.browser('/hash-with-scroll-offset')

      const checkLink = async (
        val: number | string,
        expectedScroll: number
      ) => {
        await browser.elementByCss(`#link-to-${val.toString()}`).click()
        await retry(() =>
          expect(browser.eval('window.pageYOffset')).resolves.toEqual(
            expectedScroll
          )
        )
      }

      await checkLink(6, 108)
      await checkLink(50, 724)
      await checkLink(160, 2264)
      await checkLink(300, 4224)
      await checkLink(500, 7024) // this one is hash only (`href="#hash-500"`)
      await checkLink('top', 0)
      await checkLink('non-existent', 0)
    })
  })

  describe('hash-link-back-to-same-page', () => {
    it('should scroll to the specified hash', async () => {
      const browser = await next.browser('/hash-link-back-to-same-page')

      const checkLink = async (
        val: number | string,
        expectedScroll: number
      ) => {
        await browser.elementByCss(`#link-to-${val.toString()}`).click()
        await retry(() =>
          expect(browser.eval('window.pageYOffset')).resolves.toEqual(
            expectedScroll
          )
        )
      }

      await checkLink(6, 114)
      await checkLink(50, 730)
      await checkLink(160, 2270)

      await browser
        .elementByCss('#to-other-page')
        // Navigate to other
        .click()
        // Wait for other ot load
        .waitForElementByCss('#link-to-home')
        // Navigate back to hash-link-back-to-same-page
        .click()
        // Wait for hash-link-back-to-same-page to load
        .waitForElementByCss('#to-other-page')

      await retry(() =>
        expect(browser.eval('window.pageYOffset')).resolves.toEqual(0)
      )
    })
  })

  describe('relative hashes and queries', () => {
    const pathname = '/nested-relative-query-and-hash'

    it('should work with a hash-only href', async () => {
      const browser = await next.browser(pathname)
      await browser.elementByCss('#link-to-h1-hash-only').click()

      await retry(() =>
        expect(browser.url()).resolves.toEqual(next.url + pathname + '#h1')
      )
    })

    it('should work with a hash-only `router.push(...)`', async () => {
      const browser = await next.browser(pathname)
      await browser.elementByCss('#button-to-h3-hash-only').click()

      await retry(() =>
        expect(browser.url()).resolves.toEqual(next.url + pathname + '#h3')
      )
    })

    it('should work with a query-only href', async () => {
      const browser = await next.browser(pathname)
      await browser.elementByCss('#link-to-dummy-query').click()

      await retry(() =>
        expect(browser.url()).resolves.toEqual(
          next.url + pathname + '?foo=1&bar=2'
        )
      )
    })

    it('should work with both relative hashes and queries', async () => {
      const browser = await next.browser(pathname)
      await browser.elementByCss('#link-to-h2-with-hash-and-query').click()

      await retry(() =>
        expect(browser.url()).resolves.toEqual(
          next.url + pathname + '?here=ok#h2'
        )
      )

      // Only update hash
      await browser.elementByCss('#link-to-h1-hash-only').click()
      await retry(() =>
        expect(browser.url()).resolves.toEqual(
          next.url + pathname + '?here=ok#h1'
        )
      )

      // Replace all with new query
      await browser.elementByCss('#link-to-dummy-query').click()
      await retry(() =>
        expect(browser.url()).resolves.toEqual(
          next.url + pathname + '?foo=1&bar=2'
        )
      )

      // Add hash to existing query
      await browser.elementByCss('#link-to-h1-hash-only').click()
      await retry(() =>
        expect(browser.url()).resolves.toEqual(
          next.url + pathname + '?foo=1&bar=2#h1'
        )
      )

      // Update hash again via `router.push(...)`
      await browser.elementByCss('#button-to-h3-hash-only').click()
      await retry(() =>
        expect(browser.url()).resolves.toEqual(
          next.url + pathname + '?foo=1&bar=2#h3'
        )
      )
    })
  })

  describe('not-found', () => {
    it('should trigger not-found in a server component', async () => {
      const browser = await next.browser('/not-found/servercomponent')

      expect(
        await browser.waitForElementByCss('#not-found-component').text()
      ).toBe('Not Found!')
      expect(
        await browser
          .waitForElementByCss('meta[name="robots"]')
          .getAttribute('content')
      ).toBe('noindex')
    })

    it('should trigger not-found in a client component', async () => {
      const browser = await next.browser('/not-found/clientcomponent')
      expect(
        await browser.waitForElementByCss('#not-found-component').text()
      ).toBe('Not Found!')
      expect(
        await browser
          .waitForElementByCss('meta[name="robots"]')
          .getAttribute('content')
      ).toBe('noindex')
    })
    it('should trigger not-found client-side', async () => {
      const browser = await next.browser('/not-found/client-side')
      await browser
        .elementByCss('button')
        .click()
        .waitForElementByCss('#not-found-component')
      expect(await browser.elementByCss('#not-found-component').text()).toBe(
        'Not Found!'
      )
      expect(
        await browser
          .waitForElementByCss('meta[name="robots"]')
          .getAttribute('content')
      ).toBe('noindex')
    })
    it('should trigger not-found while streaming', async () => {
      const browser = await next.browser('/not-found/suspense')
      expect(
        await browser.waitForElementByCss('#not-found-component').text()
      ).toBe('Not Found!')
      expect(
        await browser
          .waitForElementByCss('meta[name="robots"]')
          .getAttribute('content')
      ).toBe('noindex')
    })
  })

  describe('bots', () => {
    if (!isNextDeploy) {
      it('should block rendering for bots and return 404 status', async () => {
        const res = await next.fetch('/not-found/servercomponent', {
          headers: {
            'User-Agent': 'Googlebot',
          },
        })

        expect(res.status).toBe(404)
        expect(await res.text()).toInclude('"noindex"')
      })
    }
  })

  describe('redirect', () => {
    describe('components', () => {
      it('should redirect in a server component', async () => {
        const browser = await next.browser('/redirect/servercomponent')
        await browser.waitForElementByCss('#result-page')
        expect(await browser.elementByCss('#result-page').text()).toBe(
          'Result Page'
        )
      })

      it('should redirect in a client component', async () => {
        const browser = await next.browser('/redirect/clientcomponent')
        await browser.waitForElementByCss('#result-page')
        expect(await browser.elementByCss('#result-page').text()).toBe(
          'Result Page'
        )
      })

      it('should redirect client-side', async () => {
        const browser = await next.browser('/redirect/client-side')
        await browser
          .elementByCss('button')
          .click()
          .waitForElementByCss('#result-page')
        // eslint-disable-next-line jest/no-standalone-expect
        expect(await browser.elementByCss('#result-page').text()).toBe(
          'Result Page'
        )
      })

      it('should redirect to external url', async () => {
        const browser = await next.browser('/redirect/external')
        expect(await browser.waitForElementByCss('h1').text()).toBe(
          'Example Domain'
        )
      })

      it('should redirect to external url, initiating only once', async () => {
        const storageKey = Math.random()
        const browser = await next.browser(
          `/redirect/external-log/${storageKey}`
        )
        expect(await browser.waitForElementByCss('h1').text()).toBe(
          'Example Domain'
        )

        // Now check the logs...
        await browser.get(
          `${next.url}/redirect/external-log/${storageKey}?read=1`
        )
        const stored = JSON.parse(await browser.elementByCss('pre').text())

        if (stored['navigation-supported'] === 'false') {
          // Old browser. Can't know how many times we navigated. Oh well.
          return
        }

        expect(stored['navigation-supported']).toEqual('true')

        // This one is a bit flaky during dev, original notes by @sophiebits:
        // > Not actually sure why this is '2' in dev. Possibly something
        // > related to an update triggered by <HotReload>?
        expect(stored['navigate-https://example.vercel.sh/']).toBeOneOf(
          isNextDev ? ['1', '2'] : ['1']
        )
      })

      it.each(['/redirect/servercomponent', 'redirect/redirect-with-loading'])(
        'should only trigger the redirect once (%s)',
        async (path) => {
          const requestedPathnames: string[] = []

          const browser = await next.browser(path, {
            beforePageLoad(page) {
              page.on('request', async (req: Request) => {
                requestedPathnames.push(new URL(req.url()).pathname)
              })
            },
          })

          const initialTimestamp = await browser
            .waitForElementByCss('#timestamp')
            .text()

          let attempts = 0
          const maxAttempts = 5

          try {
            // this ensures the timestamp remains "stable" (ie, we didn't trigger another redirect)
            await retry(async () => {
              const currentTimestamp = await browser
                .elementByCss('#timestamp')
                .text()

              attempts++

              // If the timestamp has changed, throw immediately.
              if (currentTimestamp !== initialTimestamp) {
                throw new Error('Timestamp has changed')
              }

              // If we've reached the last attempt without the timestamp changing, force a retry failure to keep going.
              if (attempts < maxAttempts) {
                throw new Error('Forcing continue')
              }
            })
          } catch (err) {
            // If we catch the "Forcing continue" error, it means our condition held until the end.
            // If it's a different error (i.e., the timestamp changed), we rethrow it.
            if (err.message !== 'Forcing continue') {
              throw err // Rethrow if the error is not our "force continue" error.
            }
            // If it's our "forcing continue" error, do nothing. This means we succeeded.
          }

          // Ensure the redirect target page was only requested once.
          expect(
            requestedPathnames.filter(
              (pathname) => pathname === '/redirect/result'
            )
          ).toHaveLength(1)
        }
      )
    })

    describe('next.config.js redirects', () => {
      it('should redirect from next.config.js', async () => {
        const browser = await next.browser('/redirect/a')
        expect(await browser.elementByCss('h1').text()).toBe('redirect-dest')
        expect(await browser.url()).toBe(next.url + '/redirect-dest')
      })

      it('should redirect from next.config.js with link navigation', async () => {
        const browser = await next.browser('/redirect/next-config-redirect')
        await browser
          .elementByCss('#redirect-a')
          .click()
          .waitForElementByCss('h1')
        expect(await browser.elementByCss('h1').text()).toBe('redirect-dest')
        expect(await browser.url()).toBe(next.url + '/redirect-dest')
      })
    })

    describe('middleware redirects', () => {
      it('should redirect from middleware', async () => {
        const browser = await next.browser('/redirect-middleware-to-dashboard')
        expect(await browser.elementByCss('h1').text()).toBe('redirect-dest')
        expect(await browser.url()).toBe(next.url + '/redirect-dest')
      })

      it('should redirect from middleware with link navigation', async () => {
        const browser = await next.browser('/redirect/next-middleware-redirect')
        await browser
          .elementByCss('#redirect-middleware')
          .click()
          .waitForElementByCss('h1')
        expect(await browser.elementByCss('h1').text()).toBe('redirect-dest')
        expect(await browser.url()).toBe(next.url + '/redirect-dest')
      })
    })

    describe('status code', () => {
      it('should respond with 307 status code in server component', async () => {
        const res = await next.fetch('/redirect/servercomponent', {
          redirect: 'manual',
        })
        expect(res.status).toBe(307)
      })
      it('should respond with 307 status code in client component', async () => {
        const res = await next.fetch('/redirect/clientcomponent', {
          redirect: 'manual',
        })
        expect(res.status).toBe(307)
      })
      it('should respond with 308 status code if permanent flag is set', async () => {
        const res = await next.fetch('/redirect/servercomponent-2', {
          redirect: 'manual',
        })
        expect(res.status).toBe(308)
      })
    })
  })

  describe('external push', () => {
    it('should push external url without affecting hooks', async () => {
      // Log with sessionStorage to persist across navigations
      const storageKey = Math.random()
      const browser = await next.browser(`/external-push/${storageKey}`)
      await browser.elementByCss('#go').click()
      await browser.waitForCondition(
        'window.location.origin === "https://example.vercel.sh"'
      )

      // Now check the logs...
      await browser.get(`${next.url}/external-push/${storageKey}`)
      const stored = JSON.parse(await browser.elementByCss('pre').text())
      let expected = {
        // Only one navigation
        'navigate-https://example.vercel.sh/stuff?abc=123': '1',
        'navigation-supported': 'true',
        // Make sure /stuff?abc=123 is not logged here
        [`path-/external-push/${storageKey}`]: 'true',
        // isPending should have been true until the page unloads
        lastIsPending: 'true',
      }

      if (stored['navigation-supported'] !== 'true') {
        // Old browser. Can't know how many times we navigated. Oh well.
        expected['navigation-supported'] = 'false'
        for (const key in expected) {
          if (key.startsWith('navigate-')) {
            delete expected[key]
          }
        }
      }

      expect(stored).toEqual(expected)
    })
  })

  describe('navigation between pages and app', () => {
    it('should not contain _rsc query while navigating from app to pages', async () => {
      // Initiate with app
      const browser = await next.browser('/assertion/page')
      await browser
        .elementByCss('#link-to-pages')
        .click()
        .waitForElementByCss('#link-to-app')
      expect(await browser.url()).toBe(next.url + '/some')
      await browser
        .elementByCss('#link-to-app')
        .click()
        .waitForElementByCss('#link-to-pages')
      expect(await browser.url()).toBe(next.url + '/assertion/page')
    })

    it('should not contain _rsc query while navigating from pages to app', async () => {
      // Initiate with pages
      const browser = await next.browser('/some')
      await browser
        .elementByCss('#link-to-app')
        .click()
        .waitForElementByCss('#link-to-pages')
      expect(await browser.url()).toBe(next.url + '/assertion/page')
      await browser
        .elementByCss('#link-to-pages')
        .click()
        .waitForElementByCss('#link-to-app')
      expect(await browser.url()).toBe(next.url + '/some')
    })

    it('should not omit the hash while navigating from app to pages', async () => {
      const browser = await next.browser('/hash-link-to-pages-router')
      await browser
        .elementByCss('#link-to-pages-router')
        .click()
        .waitForElementByCss('#link-to-app')
      await retry(() =>
        expect(browser.url()).resolves.toEqual(next.url + '/some#non-existent')
      )
    })

    if (!isNextDev) {
      // this test is pretty hard to test in playwright, so most of the heavy lifting is in the page component itself
      // it triggers a hover on a link to initiate a prefetch request every second, and so we check that
      // it doesn't repeatedly initiate the mpa navigation request
      it('should not continously initiate a mpa navigation to the same URL when router state changes', async () => {
        let requestCount = 0
        await next.browser('/mpa-nav-test', {
          beforePageLoad(page) {
            page.on('request', (request) => {
              const url = new URL(request.url())
              // skip rsc prefetches
              if (url.pathname === '/slow-page' && !url.search) {
                requestCount++
              }
            })
          },
        })

        // wait a few seconds since prefetches are triggered in 1s intervals in the page component
        await waitFor(5000)

        expect(requestCount).toBe(1)
      })
    }
  })

  describe('nested navigation', () => {
    it('should navigate to nested pages', async () => {
      const browser = await next.browser('/nested-navigation')
      expect(await browser.elementByCss('h1').text()).toBe('Home')

      const pages = [
        ['Electronics', ['Phones', 'Tablets', 'Laptops']],
        ['Clothing', ['Tops', 'Shorts', 'Shoes']],
        ['Books', ['Fiction', 'Biography', 'Education']],
      ] as const

      for (const [category, subCategories] of pages) {
        expect(
          await browser
            .elementByCss(
              `a[href="/nested-navigation/${category.toLowerCase()}"]`
            )
            .click()
            .waitForElementByCss(`#all-${category.toLowerCase()}`)
            .text()
        ).toBe(`All ${category}`)

        for (const subcategory of subCategories) {
          expect(
            await browser
              .elementByCss(
                `a[href="/nested-navigation/${category.toLowerCase()}/${subcategory.toLowerCase()}"]`
              )
              .click()
              .waitForElementByCss(`#${subcategory.toLowerCase()}`)
              .text()
          ).toBe(`${subcategory}`)
        }
      }
    })

    it('should load chunks correctly without double encoding of url', async () => {
      const browser = await next.browser('/router')

      await browser
        .elementByCss('#dynamic-link')
        .click()
        .waitForElementByCss('#dynamic-gsp-content')

      expect(await browser.elementByCss('#dynamic-gsp-content').text()).toBe(
        'slug:1'
      )
    })
  })

  describe('SEO', () => {
    it('should emit noindex meta tag for not found page when streaming', async () => {
      const noIndexTag = '<meta name="robots" content="noindex"/>'
      const defaultViewportTag =
        '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
      const devErrorMetadataTag =
        '<meta name="next-error" content="not-found"/>'
      const html = await next.render('/not-found/suspense')

      expect(html).toContain(noIndexTag)
      // only contain once
      expect(html.split(noIndexTag).length).toBe(2)
      expect(html.split(defaultViewportTag).length).toBe(2)
      if (isNextDev) {
        // only contain dev error tag once
        expect(html.split(devErrorMetadataTag).length).toBe(2)
      }
    })

    it('should emit refresh meta tag for redirect page when streaming', async () => {
      const html = await next.render('/redirect/suspense')
      expect(html).toContain(
        '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/redirect/result"/>'
      )
    })

    it('should emit refresh meta tag (permanent) for redirect page when streaming', async () => {
      const html = await next.render('/redirect/suspense-2')
      expect(html).toContain(
        '<meta id="__next-page-redirect" http-equiv="refresh" content="0;url=/redirect/result"/>'
      )
    })

    it('should contain default meta tags in error page', async () => {
      const html = await next.render('/not-found/servercomponent')
      expect(html).toContain('<meta name="robots" content="noindex"/>')
      expect(html).toContain(
        '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
      )
    })

    it('should not log 404 errors in ipc server', async () => {
      await next.fetch('/this-path-does-not-exist')
      expect(next.cliOutput).not.toInclude(
        'PageNotFoundError: Cannot find module for page'
      )
    })
  })

  describe('navigations when attaching a Proxy to `window.Promise`', () => {
    it('should navigate without issue', async () => {
      const browser = await next.browser('/nested-navigation')
      await browser.eval(`window.Promise = new Proxy(window.Promise, {})`)

      expect(await browser.elementByCss('h1').text()).toBe('Home')

      const pages = [
        ['Electronics', ['Phones', 'Tablets', 'Laptops']],
        ['Clothing', ['Tops', 'Shorts', 'Shoes']],
        ['Books', ['Fiction', 'Biography', 'Education']],
        ['Shoes', []],
      ] as const

      for (const [category, subCategories] of pages) {
        expect(
          await browser
            .elementByCss(
              `a[href="/nested-navigation/${category.toLowerCase()}"]`
            )
            .click()
            .waitForElementByCss(`#all-${category.toLowerCase()}`)
            .text()
        ).toBe(`All ${category}`)

        for (const subcategory of subCategories) {
          expect(
            await browser
              .elementByCss(
                `a[href="/nested-navigation/${category.toLowerCase()}/${subcategory.toLowerCase()}"]`
              )
              .click()
              .waitForElementByCss(`#${subcategory.toLowerCase()}`)
              .text()
          ).toBe(`${subcategory}`)
        }
      }
    })
  })

  describe('scroll restoration', () => {
    it('should restore original scroll position when navigating back', async () => {
      const browser = await next.browser('/scroll-restoration', {
        // throttling the CPU to rule out flakiness based on how quickly the page loads
        cpuThrottleRate: 6,
      })

      const body = await browser.elementByCss('body')
      expect(await body.text()).toContain('Item 50')
      await browser.elementById('load-more').click()
      await browser.elementById('load-more').click()
      await browser.elementById('load-more').click()
      expect(await body.text()).toContain('Item 200')

      // scroll to the bottom of the page
      await browser.eval('window.scrollTo(0, document.body.scrollHeight)')

      // grab the current position
      const scrollPosition = await browser.eval('window.pageYOffset')

      await browser.elementByCss("[href='/scroll-restoration/other']").click()
      await browser.elementById('back-button').click()

      const newScrollPosition = await browser.eval('window.pageYOffset')

      // confirm that the scroll position was restored
      expect(newScrollPosition).toEqual(scrollPosition)
    })
  })

  describe('navigating to a page with async metadata', () => {
    it('shows a fallback when prefetch was pending', async () => {
      const resolveMetadataDuration = 5000
      const browser = await next.browser('/metadata-await-promise')

      // Hopefully this click happened before the prefetch was completed.
      // TODO: Programmatically trigger prefetch e.g. by mounting the link later.
      await browser
        .elementByCss("[href='/metadata-await-promise/nested']")
        .click()

      await waitFor(resolveMetadataDuration)

      expect(await browser.elementById('page-content').text()).toBe('Content')
      expect(await browser.elementByCss('title').text()).toBe('Async Title')
    })

    it('shows a fallback when prefetch completed', async () => {
      const resolveMetadataDuration = 5000
      const browser = await next.browser('/metadata-await-promise')

      if (!isNextDev) {
        await waitFor(resolveMetadataDuration + 500)
      }

      await browser
        .elementByCss("[href='/metadata-await-promise/nested']")
        .click()

      if (!isNextDev) {
        expect(
          await browser
            .waitForElementByCss(
              '#loading',
              // Give it some time to commit
              100
            )
            .text()
        ).toEqual('Loading')
        expect(await browser.elementByCss('title').text()).toBe('Async Title')

        await waitFor(resolveMetadataDuration + 500)
      }

      expect(await browser.elementById('page-content').text()).toBe('Content')
    })
  })

  describe('navigating to dynamic params & changing the casing', () => {
    it('should load the page correctly', async () => {
      const browser = await next.browser('/dynamic-param-casing-change')

      // note the casing here capitalizes `ParamA`
      await browser
        .elementByCss("[href='/dynamic-param-casing-change/ParamA']")
        .click()

      // note the `paramA` casing has now changed
      await browser
        .elementByCss("[href='/dynamic-param-casing-change/paramA/noParam']")
        .click()

      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          'noParam page'
        )
      })

      await browser.back()

      await browser
        .elementByCss("[href='/dynamic-param-casing-change/paramA/paramB']")
        .click()

      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          '[paramB] page'
        )
      })
    })
  })

  describe('browser back to a revalidated page', () => {
    it('should load the page', async () => {
      const browser = await next.browser('/popstate-revalidate')
      expect(await browser.elementByCss('h1').text()).toBe('Home')
      await browser.elementByCss("[href='/popstate-revalidate/foo']").click()
      await browser.waitForElementByCss('#submit-button')
      expect(await browser.elementByCss('h1').text()).toBe('Form')
      await browser.elementById('submit-button').click()

      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          'Form Submitted.'
        )
      })

      await browser.back()

      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe('Home')
      })
    })
  })

  describe('middleware redirect', () => {
    it('should change browser location when router.refresh() gets a redirect response', async () => {
      const browser = await next.browser('/redirect-on-refresh/auth')
      await retry(async () =>
        expect(await browser.url()).toBe(
          next.url + '/redirect-on-refresh/dashboard'
        )
      )
    })
  })

  if (isNextDev) {
    describe('locale warnings', () => {
      it('should warn about using the `locale` prop with `next/link` in app router', async () => {
        const browser = await next.browser('/locale-app')
        const logs = await browser.log()
        expect(logs).toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining(
              'The `locale` prop is not supported in `next/link` while using the `app` router.'
            ),
            source: 'warning',
          })
        )
      })

      it('should have no warnings in pages router', async () => {
        const browser = await next.browser('/locale-pages')
        const logs = await browser.log()
        expect(logs.filter((log) => log.source === 'warning')).toHaveLength(0)
      })
    })
  }
})
