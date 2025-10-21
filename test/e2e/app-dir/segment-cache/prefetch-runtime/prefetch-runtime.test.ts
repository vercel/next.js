import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('runtime prefetching', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('disabled in development', () => {})
    return
  }

  let currentCliOutputIndex = 0
  beforeEach(() => {
    resetCliOutput()
  })

  const getCliOutput = () => {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  const resetCliOutput = () => {
    currentCliOutputIndex = next.cliOutput.length
  }

  describe.each([
    {
      description: 'in a page',
      prefix: 'in-page',
    },
    {
      description: 'in a private cache',
      prefix: 'in-private-cache',
    },
    {
      description: 'passed to a public cache',
      prefix: 'passed-to-public-cache',
    },
  ])('$description', ({ prefix }) => {
    it('includes dynamic params, but not dynamic content', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      // Reveal the link to trigger a runtime prefetch for one value of the dynamic param
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/${prefix}/dynamic-params/123"]`
        )
        await linkToggle.click()
      }, [
        // Should allow reading dynamic params
        {
          includes: 'Param: 123',
        },
        // Should not prefetch the dynamic content
        {
          includes: 'Dynamic content',
          block: 'reject',
        },
      ])

      // Reveal the link to trigger a runtime prefetch for a different value of the dynamic param
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/${prefix}/dynamic-params/456"]`
        )
        await linkToggle.click()
      }, [
        // Should allow reading dynamic params
        {
          includes: 'Param: 456',
        },
        // Should not prefetch the dynamic content
        {
          includes: 'Dynamic content',
          block: 'reject',
        },
      ])

      // Navigate to the page
      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(`a[href="/${prefix}/dynamic-params/123"]`)
              .click()
          },
          {
            // Temporarily block the navigation request.
            // The runtime-prefetched parts of the tree should be visible before it finishes.
            includes: 'Dynamic content',
            block: true,
          }
        )
        expect(await browser.elementById('param-value').text()).toEqual(
          'Param: 123'
        )
      })
      // After navigating, we should see both the parts that we prefetched and dynamic content.
      expect(await browser.elementById('param-value').text()).toEqual(
        'Param: 123'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )

      await browser.back()

      // Navigate to the other page
      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(`a[href="/${prefix}/dynamic-params/456"]`)
              .click()
          },
          {
            // Temporarily block the navigation request.
            // The runtime-prefetched parts of the tree should be visible before it finishes.
            includes: 'Dynamic content',
            block: true,
          }
        )
        expect(await browser.elementById('param-value').text()).toEqual(
          'Param: 456'
        )
      })
      // After navigating, we should see both the parts that we prefetched and dynamic content.
      expect(await browser.elementById('param-value').text()).toEqual(
        'Param: 456'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )
    })

    it('includes root params, but not dynamic content', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/with-root-param/en', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      // Reveal the link to trigger a runtime prefetch for one value of the root param
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/with-root-param/en/${prefix}/root-params"]`
        )
        await linkToggle.click()
      }, [
        // Should allow reading root params
        {
          includes: 'Lang: en',
        },
        // Should not prefetch the dynamic content
        {
          includes: 'Dynamic content',
          block: 'reject',
        },
      ])

      // TODO(runtime-ppr) - visiting root params that weren't in generateStaticParams errors when deployed
      if (!isNextDeploy) {
        // Reveal the link to trigger a runtime prefetch for a different value of the root param
        await act(async () => {
          const linkToggle = await browser.elementByCss(
            `input[data-link-accordion="/with-root-param/de/${prefix}/root-params"]`
          )
          await linkToggle.click()
        }, [
          // Should allow reading root params
          {
            includes: 'Lang: de',
          },
          // Should not prefetch the dynamic content
          {
            includes: 'Dynamic content',
            block: 'reject',
          },
        ])
      }

      // Navigate to the first page
      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(
                `a[href="/with-root-param/en/${prefix}/root-params"]`
              )
              .click()
          },
          {
            // Temporarily block the navigation request.
            // The runtime-prefetched parts of the tree should be visible before it finishes.
            includes: 'Dynamic content',
            block: true,
          }
        )
        expect(await browser.elementById('root-param-value').text()).toEqual(
          'Lang: en'
        )
      })
      // After navigating, we should see both the parts that we prefetched and dynamic content.
      expect(await browser.elementById('root-param-value').text()).toEqual(
        'Lang: en'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )

      // TODO(runtime-ppr) - visiting root params that weren't in generateStaticParams errors when deployed
      if (!isNextDeploy) {
        await browser.back()

        // Navigate to the other page
        await act(async () => {
          await act(
            async () => {
              await browser
                .elementByCss(
                  `a[href="/with-root-param/de/${prefix}/root-params"]`
                )
                .click()
            },
            {
              // Temporarily block the navigation request.
              // The runtime-prefetched parts of the tree should be visible before it finishes.
              includes: 'Dynamic content',
              block: true,
            }
          )
          expect(await browser.elementById('root-param-value').text()).toEqual(
            'Lang: de'
          )
        })
        // After navigating, we should see both the parts that we prefetched and dynamic content.
        expect(await browser.elementById('root-param-value').text()).toEqual(
          'Lang: de'
        )
        expect(await browser.elementById('dynamic-content').text()).toEqual(
          'Dynamic content'
        )
      }
    })

    it('includes search params, but not dynamic content', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      // Reveal the link to trigger a runtime prefetch for one value of the search param
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/${prefix}/search-params?searchParam=123"]`
        )
        await linkToggle.click()
      }, [
        // Should allow reading search params
        {
          includes: 'Search param: 123',
        },
        // Should not prefetch the dynamic content
        {
          includes: 'Dynamic content',
          block: 'reject',
        },
      ])

      // Reveal the link to trigger a runtime prefetch for a different value of the search param
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/${prefix}/search-params?searchParam=456"]`
        )
        await linkToggle.click()
      }, [
        // Should allow reading search params
        {
          includes: 'Search param: 456',
        },
        // Should not prefetch the dynamic content
        {
          includes: 'Dynamic content',
          block: 'reject',
        },
      ])

      // Navigate to the page
      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(
                `a[href="/${prefix}/search-params?searchParam=123"]`
              )
              .click()
          },
          {
            // Temporarily block the navigation request.
            // The runtime-prefetched parts of the tree should be visible before it finishes.
            includes: 'Dynamic content',
            block: true,
          }
        )
        expect(await browser.elementById('search-param-value').text()).toEqual(
          'Search param: 123'
        )
      })
      // After navigating, we should see both the parts that we prefetched and dynamic content.
      expect(await browser.elementById('search-param-value').text()).toEqual(
        'Search param: 123'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )

      await browser.back()

      // Navigate to the other page
      await act(
        async () => {
          await browser
            .elementByCss(`a[href="/${prefix}/search-params?searchParam=456"]`)
            .click()
        },
        {
          // Now the dynamic content should be fetched
          includes: 'Dynamic content',
        }
      )
      expect(await browser.elementById('search-param-value').text()).toEqual(
        'Search param: 456'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )
    })

    it('includes headers, but not dynamic content', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      // Reveal the link to trigger a runtime prefetch for one value of the search param
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/${prefix}/headers"]`
        )
        await linkToggle.click()
      }, [
        // Should allow reading headers
        {
          includes: 'Header: present',
        },
        // Should not prefetch the dynamic content
        {
          includes: 'Dynamic content',
          block: 'reject',
        },
      ])

      // Navigate to the page
      await act(async () => {
        await act(
          async () => {
            await browser.elementByCss(`a[href="/${prefix}/headers"]`).click()
          },
          {
            // Temporarily block the navigation request.
            // The runtime-prefetched parts of the tree should be visible before it finishes.
            includes: 'Dynamic content',
            block: true,
          }
        )
        expect(await browser.elementById('header-value').text()).toEqual(
          'Header: present'
        )
      })
      // After navigating, we should see both the parts that we prefetched and dynamic content.
      expect(await browser.elementById('header-value').text()).toEqual(
        'Header: present'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )
    })

    it('includes cookies, but not dynamic content', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      // Clear cookies after the test. This currently doesn't happen automatically.
      await using _ = defer(() => browser.deleteCookies())

      const act = createRouterAct(page)

      await browser.addCookie({ name: 'testCookie', value: 'initialValue' })

      // Reveal the link to trigger a runtime prefetch for the initial cookie value
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/${prefix}/cookies"]`
        )
        await linkToggle.click()
      }, [
        // Should allow reading cookies
        {
          includes: 'Cookie: initialValue',
        },
        // Should not prefetch the dynamic content
        {
          includes: 'Dynamic content',
          block: 'reject',
        },
      ])

      // Navigate to the page
      await act(async () => {
        await act(
          async () => {
            await browser.elementByCss(`a[href="/${prefix}/cookies"]`).click()
          },
          {
            // Temporarily block the navigation request.
            // The runtime-prefetched parts of the tree should be visible before it finishes.
            includes: 'Dynamic content',
            block: true,
          }
        )
        expect(await browser.elementById('cookie-value').text()).toEqual(
          'Cookie: initialValue'
        )
      })
      // After navigating, we should see both the parts that we prefetched and dynamic content.
      expect(await browser.elementById('cookie-value').text()).toEqual(
        'Cookie: initialValue'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )

      // Update the cookie via a server action.
      // This should cause the client cache to be dropped,
      // so the page should get prefetched again when the link becomes visible
      await browser.elementByCss('input[name="cookie"]').type('updatedValue')
      await browser.elementByCss('[type="submit"]').click()

      // Go back to the previous page
      await browser.back()

      // wait a tick before navigating
      await waitFor(500)

      // Navigate to the page
      await act(async () => {
        await act(
          async () => {
            await browser.elementByCss(`a[href="/${prefix}/cookies"]`).click()
          },
          {
            includes: 'Dynamic content',
            block: true,
          }
        )
        expect(await browser.elementById('cookie-value').text()).toEqual(
          'Cookie: updatedValue'
        )
      })

      expect(await browser.elementById('cookie-value').text()).toEqual(
        'Cookie: updatedValue'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )
    })

    it('can completely prefetch a page that uses cookies and no uncached IO', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      // Clear cookies after the test. This currently doesn't happen automatically.
      await using _ = defer(() => browser.deleteCookies())

      const act = createRouterAct(page)

      await browser.addCookie({ name: 'testCookie', value: 'initialValue' })

      // Reveal the link to trigger a runtime prefetch for the initial cookie value
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/${prefix}/cookies-only"]`
        )
        await linkToggle.click()
      }, [
        // Should allow reading cookies
        {
          includes: 'Cookie: initialValue',
        },
      ])

      // Navigate to the page.
      await act(
        async () => {
          await browser
            .elementByCss(`a[href="/${prefix}/cookies-only"]`)
            .click()
        },
        // The page doesn't use any other IO, so we prefetched it completely, and shouldn't issue any more requests.
        'no-requests'
      )
      expect(await browser.elementById('cookie-value').text()).toEqual(
        'Cookie: initialValue'
      )
    })
  })

  describe('should not cache runtime prefetch responses in the browser cache or server-side', () => {
    // This is a bit difficult to test, but we can request the same thing repeatedly and expect different results.

    it.each([
      { description: 'in a page', prefix: 'in-page' },
      { description: 'in a private cache', prefix: 'in-private-cache' },
    ])(
      'different cookies should return different prefetch results - $description',
      async ({ prefix }) => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        // Clear cookies after the test. This currently doesn't happen automatically.
        await using _ = defer(() => browser.deleteCookies())

        const act = createRouterAct(page)

        await browser.addCookie({ name: 'testCookie', value: 'initialValue' })

        // Reveal the link to trigger a runtime prefetch for the initial cookie value
        await act(async () => {
          const linkToggle = await browser.elementByCss(
            `input[data-link-accordion="/${prefix}/cookies-only"]`
          )
          await linkToggle.click()
        }, [
          // Should allow reading cookies
          {
            includes: 'Cookie: initialValue',
          },
        ])

        // Reload the page with a new cookie value
        await browser.addCookie({ name: 'testCookie', value: 'updatedValue' })
        await browser.refresh()

        // Reveal the link to trigger a runtime prefetch for the updated cookie value.
        await act(async () => {
          const linkToggle = await browser.elementByCss(
            `input[data-link-accordion="/${prefix}/cookies-only"]`
          )
          await linkToggle.click()
        }, [
          // The response shouldn't be cached in the browser or on the server.
          // If it was, we'd get a stale value here.
          {
            includes: 'Cookie: updatedValue',
          },
        ])
      }
    )

    it('private caches should return new results on each request', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      // Clear cookies after the test. This currently doesn't happen automatically.
      await using _ = defer(() => browser.deleteCookies())

      const act = createRouterAct(page)

      // Reveal the link to trigger the first runtime prefetch
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/in-private-cache/date-now"]`
        )
        await linkToggle.click()
      }, [
        // The timestamp value is in a private cache, so it should be included
        {
          includes: 'Timestamp: ',
        },
      ])

      // Navigate to the page to reveal the runtime-prefetched content, and save the timestamp value it had
      let firstTimestampValue: string
      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(`a[href="/in-private-cache/date-now"]`)
              .click()
          },
          // Temporarily block the navigation request.
          // The prefetched parts of the tree should be visible before it finishes.
          'block'
        )
        firstTimestampValue = await browser.elementById('timestamp').text()
      })

      // Go back to the initial page and reload it to clear the client router cache
      await browser.back()
      await browser.refresh()

      // Reveal the link to trigger the second runtime prefetch
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/in-private-cache/date-now"]`
        )
        await linkToggle.click()
      }, [
        // The timestamp value is in a private cache, so it should be included
        {
          includes: 'Timestamp: ',
        },
      ])

      // Navigate to the page to reveal the runtime-prefetched content, and save the timestamp value it had
      let secondTimestampValue: string
      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(`a[href="/in-private-cache/date-now"]`)
              .click()
          },
          // Temporarily block the navigation request.
          // The prefetched parts of the tree should be visible before it finishes.
          'block'
        )
        secondTimestampValue = await browser.elementById('timestamp').text()
      })

      // If the runtime prefetch response wasn't cached, the responses should be different
      expect(firstTimestampValue).not.toEqual(secondTimestampValue)
    })
  })

  it('can completely prefetch a page that is fully static', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })

    const act = createRouterAct(page)

    // Reveal the link to trigger a runtime prefetch for the page
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `input[data-link-accordion="/fully-static"]`
      )
      await linkToggle.click()
    }, [
      {
        includes: 'Hello from a fully static page!',
      },
    ])

    // Navigate to the page.
    await act(
      async () => {
        await browser.elementByCss(`a[href="/fully-static"]`).click()
      },
      // The page doesn't use any IO, so we prefetched it completely, and shouldn't issue any more requests.
      'no-requests'
    )
    expect(await browser.elementByCss('p#intro').text()).toBe(
      'Hello from a fully static page!'
    )
  })

  describe('cache stale time handling', () => {
    it.each([
      {
        // If a cache has an expiration time under 5min (DYNAMIC_EXPIRE), we omit it from static prerenders.
        // However, it should still be included in a runtime prefetch if its stale time is >=30s. (RUNTIME_PREFETCH_DYNAMIC_STALE)
        description:
          'includes short-lived public caches with a long enough staleTime',
        staticContent: 'This page uses a short-lived public cache',
        path: '/caches/public-short-expire-long-stale',
      },
      {
        // If a cache has an expiration time under 5min (DYNAMIC_EXPIRE), we omit it from static prerenders.
        // However, it should still be included in a runtime prefetch if its stale time is >=30s. (RUNTIME_PREFETCH_DYNAMIC_STALE)
        // `cacheLife("seconds")` is deliberately set to have a stale time of 30s to stay above this treshold.
        description: 'includes public caches with cacheLife("seconds")',
        staticContent: 'This page uses a short-lived public cache',
        path: '/caches/public-seconds',
      },
      {
        // A Private cache will always be omitted from static prerenders.
        // However, it should still be included in a runtime prefetch if its stale time is >=30s. (RUNTIME_PREFETCH_DYNAMIC_STALE)
        // `cacheLife("seconds")` is deliberately set to have a stale time of 30s to stay above this treshold.
        description: 'includes private caches with cacheLife("seconds")',
        staticContent: 'This page uses a short-lived private cache',
        path: '/caches/private-seconds',
      },
    ])('$description', async ({ path, staticContent }) => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      const DYNAMICALLY_PREFETCHABLE_CONTENT = 'Short-lived cached content'

      // Reveal the link to trigger a static prefetch
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-prefetch="auto"][data-link-accordion="${path}"]`
        )
        await linkToggle.click()
      }, [
        // Should include the static shell
        {
          includes: staticContent,
        },
        // Should not include the short-lived cache
        {
          includes: DYNAMICALLY_PREFETCHABLE_CONTENT,
          block: 'reject',
        },
      ])

      // Reveal the link to trigger a runtime prefetch
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-prefetch="runtime"][data-link-accordion="${path}"]`
        )
        await linkToggle.click()
      }, [
        // Should include the short-lived cache
        {
          includes: DYNAMICALLY_PREFETCHABLE_CONTENT,
        },
      ])

      // Navigate to the page. We didn't include any uncached IO, so the page is fully prefetched,
      // and this shouldn't issue any more requests
      await act(async () => {
        await browser.elementByCss(`a[href="${path}"]`).click()
      }, 'no-requests')

      expect(await browser.elementByCss('main').text()).toInclude(
        DYNAMICALLY_PREFETCHABLE_CONTENT
      )
    })

    it('omits short-lived public caches with a short enough staleTime', async () => {
      // If a cache has a stale time below 30s (RUNTIME_PREFETCH_DYNAMIC_STALE), we should omit it from runtime prefetches.

      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      const STATIC_CONTENT = 'This page uses a short-lived public cache'
      const DYNAMIC_CONTENT = 'Short-lived cached content'

      // Reveal the link to trigger a static prefetch
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-prefetch="auto"][data-link-accordion="/caches/public-short-expire-short-stale"]`
        )
        await linkToggle.click()
      }, [
        // Should include the static shell
        {
          includes: STATIC_CONTENT,
        },
        // Should not include the short-lived cache
        // (We set the `expire` value to be under 5min, so it will be excluded from prerenders)
        {
          includes: DYNAMIC_CONTENT,
          block: 'reject',
        },
      ])

      // Reveal the link to trigger a runtime prefetch.
      // It'll essentially be the same as the static prefetch, because the only dynamic hole
      // will be omitted from both.
      // (NOTE: in the future, we might prevent scenarios like this via `generatePrefetch`)
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-prefetch="runtime"][data-link-accordion="/caches/public-short-expire-short-stale"]`
        )
        await linkToggle.click()
      }, [
        // Should include the shell
        {
          includes: STATIC_CONTENT,
        },
        // Should not include the short-lived cache
        // (We set the `stale` value to be under 30s, so it will be excluded from runtime prerenders)
        {
          includes: DYNAMIC_CONTENT,
          block: 'reject',
        },
      ])

      // Navigate to the page
      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(`a[href="/caches/public-short-expire-short-stale"]`)
              .click()
          },
          {
            // Temporarily block the navigation request.
            // The prefetched parts of the tree should be visible before it finishes.
            includes: DYNAMIC_CONTENT,
            block: true,
          }
        )
        expect(await browser.elementById('intro').text()).toInclude(
          STATIC_CONTENT
        )
      })

      // After navigating, we should see both the parts that we prefetched and the short lived cache.
      expect(await browser.elementById('intro').text()).toInclude(
        STATIC_CONTENT
      )
      expect(await browser.elementById('cached-value').text()).toMatch(/\d+/)
    })

    it('omits private caches with a short enough staleTime', async () => {
      // If a cache has a stale time below 30s (RUNTIME_PREFETCH_DYNAMIC_STALE), we should omit it from runtime prefetches.

      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      const STATIC_CONTENT = 'This page uses a short-lived private cache'
      const DYNAMIC_CONTENT = 'Short-lived cached content'

      // Reveal the link to trigger a static prefetch
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-prefetch="auto"][data-link-accordion="/caches/private-short-stale"]`
        )
        await linkToggle.click()
      }, [
        // Should include the static shell
        {
          includes: STATIC_CONTENT,
        },
        // Should not include the short-lived cache
        // (We set the `expire` value to be under 5min, so it will be excluded from prerenders)
        {
          includes: DYNAMIC_CONTENT,
          block: 'reject',
        },
      ])

      // Reveal the link to trigger a runtime prefetch
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-prefetch="runtime"][data-link-accordion="/caches/private-short-stale"]`
        )
        await linkToggle.click()
      }, [
        // Should include the shell
        {
          includes: STATIC_CONTENT,
        },
        // Should not prefetch the short-lived cache
        // (We set the `stale` value to be under 30s, so it will be excluded from runtime prefetches)
        {
          includes: DYNAMIC_CONTENT,
          block: 'reject',
        },
      ])

      // Navigate to the page
      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(`a[href="/caches/private-short-stale"]`)
              .click()
          },
          {
            // Temporarily block the navigation request.
            // The runtime-prefetched parts of the tree should be visible before it finishes.
            includes: DYNAMIC_CONTENT,
            block: true,
          }
        )
        expect(await browser.elementById('intro').text()).toInclude(
          STATIC_CONTENT
        )
      })

      // After navigating, we should see both the parts that we prefetched and dynamic content.
      expect(await browser.elementById('intro').text()).toInclude(
        STATIC_CONTENT
      )
      const cachedValue1 = await browser.elementById('cached-value').text()
      expect(cachedValue1).toMatch(/\d+/)

      // Try navigating again. The cache is private, so we should see a different timestamp
      await browser.back()

      // Reveal the link again. The prefetch should be cached, so we shouldn't see any requests
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-link-accordion="/caches/private-short-stale"]`
        )
        await linkToggle.click()
      }, 'no-requests')

      // Navigate to the page again
      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(`a[href="/caches/private-short-stale"]`)
              .click()
          },
          {
            // Temporarily block the navigation request.
            // The runtime-prefetched parts of the tree should be visible before it finishes.
            includes: 'Short-lived cached content',
            block: true,
          }
        )
        expect(await browser.elementById('intro').text()).toInclude(
          STATIC_CONTENT
        )
      })

      // After navigating, we should see both the parts that we prefetched and dynamic content.
      // The private cache was omitted from the runtime prefetch, so we didn't cache it in the router,
      // and it was not cached server-side either, so we should get a different value than the previous request.
      const cachedValue2 = await browser.elementById('cached-value').text()
      expect(cachedValue2).toMatch(/\d+/)

      expect(cachedValue1).not.toEqual(cachedValue2)
    })
  })

  describe('errors', () => {
    it.each([
      {
        description: 'when sync IO is used after awaiting cookies()',
        path: '/errors/sync-io-after-runtime-api/cookies',
      },
      {
        description: 'when sync IO is used after awaiting headers()',
        path: '/errors/sync-io-after-runtime-api/headers',
      },
      // TODO(dynamic-ppr):
      // A tree prefetch for "/dynamic-params/123" currently causes it to be prerendered on demand,
      // meaning that we end up statically prerendering it with all the params included.
      // Because of this, `await params` doesn't hang in the static prerender, so we hit the sync IO error behind it.
      // This error somehow causes an infinite redirect loop between two different `?_rsc` URLs.
      // Investigate this separately or wait until we start always using fallback params for route trees.
      //
      // {
      //   description: 'when sync IO is used after awaiting dynamic params',
      //   path: '/errors/sync-io-after-runtime-api/dynamic-params/123',
      // },
      {
        description: 'when sync IO is used after awaiting searchParams',
        path: '/errors/sync-io-after-runtime-api/search-params?foo=bar',
      },
      {
        description: 'when sync IO is used after awaiting a private cache',
        path: '/errors/sync-io-after-runtime-api/private-cache',
      },
      {
        description:
          'when sync IO is used after awaiting a quickly-expiring public cache',
        path: '/errors/sync-io-after-runtime-api/quickly-expiring-public-cache',
      },
    ])(
      'aborts the prerender without logging an error $description',
      async ({ path }) => {
        // In a runtime prefetch, we might encounter sync IO usages that weren't caught during build,
        // because they were hidden behind e.g. a cookies() call.
        // We currently have no way to catch these statically.
        // In that case, we should abort the prerender, but still return partial content.

        // TODO: this doesn't work as well as it could, see comment before the navigation

        let page: Playwright.Page
        const browser = await next.browser('/errors', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page)

        const STATIC_CONTENT = 'This page performs sync IO after'

        // Reveal the link to trigger a runtime prefetch
        await act(async () => {
          const linkToggle = await browser.elementByCss(
            `input[data-prefetch="runtime"][data-link-accordion="${path}"]`
          )
          await linkToggle.click()
        }, [
          // Should include the shell
          {
            includes: STATIC_CONTENT,
          },
          // Should abort the render when sync IO is encountered,
          // so this should never be included
          {
            includes: 'Timestamp',
            block: 'reject',
          },
        ])

        if (!isNextDeploy) {
          expect(getCliOutput()).not.toMatch(`Date.now()`)
        }

        // Navigate to the page
        await act(async () => {
          await act(
            async () => {
              await browser.elementByCss(`a[href="${path}"]`).click()
            },
            {
              // Temporarily block the navigation request.
              includes: 'Timestamp',
              block: true,
            }
          )
          // We aborted the render because of sync IO, so we won't display the timestamp,
          // but due to the way we sequence tasks, we should've at least finished rendering the static parts.
          expect(await browser.elementsByCss('#timestamp')).toHaveLength(0)
          expect(await browser.elementById('intro').text()).toInclude(
            STATIC_CONTENT
          )
        })

        // After navigating, we should see the sync IO result that we omitted from the prefetch.
        expect(await browser.elementById('intro').text()).toInclude(
          STATIC_CONTENT
        )
        expect(await browser.elementById('timestamp').text()).toMatch(
          /Timestamp: \d+/
        )
      }
    )

    it('should trigger error boundaries for errors that occurred in runtime-prefetched content', async () => {
      // A thrown error in the prerender should not stop us from sending a prefetch response.
      // This should work without any extra effort, but I'm adding a test for it as a sanity check.

      let page: Playwright.Page
      const browser = await next.browser('/errors', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      const STATIC_CONTENT = 'This page errors after a cookies call'

      // Reveal the link to trigger a runtime prefetch
      await act(async () => {
        const linkToggle = await browser.elementByCss(
          `input[data-prefetch="runtime"][data-link-accordion="/errors/error-after-cookies"]`
        )
        await linkToggle.click()
      }, [
        // Should include the shell
        {
          includes: STATIC_CONTENT,
        },
      ])

      if (!isNextDeploy) {
        expect(getCliOutput()).toContain('Error: Kaboom')
      }

      // Navigate to the page. We already have the paged cached.
      // Even though the render errored, we shouldn't fetch it again.
      await act(async () => {
        await browser
          .elementByCss(`a[href="/errors/error-after-cookies"]`)
          .click()
      }, 'no-requests')

      // After navigating, we should see the sync IO result that we omitted from the prefetch.
      expect(await browser.elementById('intro').text()).toInclude(
        STATIC_CONTENT
      )
      expect(await browser.elementById('error-boundary').text()).toInclude(
        'Error boundary: An error occurred in the Server Components render'
      )
    })
  })
})

function defer(callback: () => Promise<void>) {
  return {
    [Symbol.asyncDispose]: callback,
  }
}
