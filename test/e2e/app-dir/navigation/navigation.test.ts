import { createNextDescribe } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import type { Request } from 'playwright-chromium'

createNextDescribe(
  'app dir - navigation',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isNextDeploy }) => {
    describe('query string', () => {
      it('should set query correctly', async () => {
        const browser = await next.browser('/')
        expect(await browser.elementById('query').text()).toMatchInlineSnapshot(
          `""`
        )

        browser.elementById('set-query').click()

        await retry(() =>
          expect(browser.elementById('query').text()).resolves.toEqual(
            'a=b&c=d'
          )
        )

        const url = new URL(await browser.url())
        expect(url.searchParams.toString()).toMatchInlineSnapshot(`"a=b&c=d"`)
      })

      it('should handle unicode search params', async () => {
        const requests: Array<{
          pathname: string
          ok: boolean
          headers: Record<string, string>
        }> = []

        const browser = await next.browser('/search-params?name=名')
        browser.on('request', async (req: Request) => {
          const res = await req.response()
          if (!res) return

          requests.push({
            pathname: new URL(req.url()).pathname,
            ok: res.ok(),
            headers: res.headers(),
          })
        })
        expect(await browser.elementById('name').text()).toBe('名')
        await browser.elementById('link').click()

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
        async function runTests(page: string, waitForNEffects: number) {
          const browser = await next.browser(page)

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

        it('should be stable in app', async () => {
          await runTests(
            '/search-params/foo',
            // App Router doesn't re-render on initial load (the params are baked
            // server side). In development, effects will render twice.
            isNextDev ? 2 : 1
          )
        })

        it('should be stable in pages', async () => {
          await runTests(
            '/search-params-pages/foo',
            // Pages Router re-renders on initial load and after hydration, the
            // params when initially loaded are null.
            2
          )
        })
      })
    })

    describe('hash', () => {
      it('should scroll to the specified hash', async () => {
        const browser = await next.browser('/hash')

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
        await checkLink(300, 4230)
        await checkLink(500, 7030) // this one is hash only (`href="#hash-500"`)
        await checkLink('top', 0)
        await checkLink('non-existent', 0)
      })

      it('should not scroll to hash when scroll={false} is set', async () => {
        const browser = await next.browser('/hash-changes')
        const curScroll = await browser.eval(
          'document.documentElement.scrollTop'
        )
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

        await checkLink(6, 94)
        await checkLink(50, 710)
        await checkLink(160, 2250)
        await checkLink(300, 4210)
        await checkLink(500, 7010) // this one is hash only (`href="#hash-500"`)
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
          const browser = await next.browser(
            '/redirect-middleware-to-dashboard'
          )
          expect(await browser.elementByCss('h1').text()).toBe('redirect-dest')
          expect(await browser.url()).toBe(next.url + '/redirect-dest')
        })

        it('should redirect from middleware with link navigation', async () => {
          const browser = await next.browser(
            '/redirect/next-middleware-redirect'
          )
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
          expect(browser.url()).resolves.toEqual(
            next.url + '/some#non-existent'
          )
        )
      })

      if (!isNextDev) {
        // this test is pretty hard to test in playwright, so most of the heavy lifting is in the page component itself
        // it triggers a hover on a link to initiate a prefetch request every second, and so we check that
        // it doesn't repeatedly initiate the mpa navigation request
        it('should not continously initiate a mpa navigation to the same URL when router state changes', async () => {
          let requestCount = 0
          const browser = await next.browser('/mpa-nav-test', {
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

          await browser.waitForElementByCss('#link-to-slow-page')

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
          '<meta http-equiv="refresh" content="1;url=/redirect/result"/>'
        )
      })

      it('should emit refresh meta tag (permanent) for redirect page when streaming', async () => {
        const html = await next.render('/redirect/suspense-2')
        expect(html).toContain(
          '<meta http-equiv="refresh" content="0;url=/redirect/result"/>'
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
  }
)
