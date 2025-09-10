import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('searchparams-reuse-loading', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should re-use the prefetched loading state when navigating to a new searchParam value', async () => {
    const browser = await next.browser('/search')
    await browser.waitForElementByCss('#page-content')

    // trigger a transition by submitting a new search
    await browser.elementByCss('input').type('test')
    await browser.elementByCss('button').click()

    const loading = await browser.waitForElementByCss('#loading')
    expect(await loading.text()).toBe('Loading...')

    const searchValue = await browser.waitForElementByCss('#search-value')
    expect(await searchValue.text()).toBe('Search Value: test')

    // One more time!
    await browser.elementByCss('input').type('another')
    await browser.elementByCss('button').click()

    const newLoading = await browser.waitForElementByCss('#loading')
    expect(await newLoading.text()).toBe('Loading...')

    const newSearchValue = await browser.waitForElementByCss('#search-value')
    expect(await newSearchValue.text()).toBe('Search Value: another')
  })

  it('should properly render root page with searchParams when prefetch is aliased', async () => {
    const browser = await next.browser('/search-params')
    await browser.elementByCss("[href='/?id=1']").click()
    const params = await browser.waitForElementByCss('#root-params').text()
    expect(params).toBe('{"id":"1"}')
  })

  it('should reflect the correct searchParams when re-using the same page segment', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss("[href='/params-first']").click()
    await browser.elementByCss("[href='/params-first?page=2']").click()
    await retry(async () => {
      expect(await browser.url()).toContain('/params-first?page=2')
    })
    expect(await browser.elementByCss('h1').text()).toBe('You are on page "2".')
    await browser.elementByCss("[href='/params-first?page=3']").click()
    await retry(async () => {
      expect(await browser.url()).toContain('/params-first?page=3')
    })
    expect(await browser.elementByCss('h1').text()).toBe('You are on page "3".')
    await browser.elementByCss("[href='/params-first?page=4']").click()
    await retry(async () => {
      expect(await browser.url()).toContain('/params-first?page=4')
    })
    expect(await browser.elementByCss('h1').text()).toBe('You are on page "4".')
    await browser.elementByCss("[href='/params-first']").click()
    await retry(async () => {
      const currentUrl = new URL(await browser.url())
      expect(currentUrl.pathname).toBe('/params-first')
      expect(currentUrl.search).toBe('')
    })
    expect(await browser.elementByCss('h1').text()).toBe(
      'You are on the root page.'
    )
  })

  it('should reflect the correct searchParams when the root page is prefetched first', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss("[href='/root-page-first']").click()
    await browser.elementByCss("[href='/root-page-first?page=2']").click()
    await retry(async () => {
      expect(await browser.url()).toContain('/root-page-first?page=2')
    })
    expect(await browser.elementByCss('h1').text()).toBe('You are on page "2".')
    await browser.elementByCss("[href='/root-page-first']").click()
    await retry(async () => {
      const currentUrl = new URL(await browser.url())
      expect(currentUrl.pathname).toBe('/root-page-first')
      expect(currentUrl.search).toBe('')
    })
    expect(await browser.elementByCss('h1').text()).toBe(
      'You are on the root page.'
    )
  })

  describe('when aliasing is skipped', () => {
    it('should work for not found pages', async () => {
      const browser = await next.browser('/mpa-navs')
      await browser.elementByCss("[href='/non-existent-page?id=1']").click()

      // the first link would have been the "aliased" entry since it was prefetched first. Validate that it's the correct URL
      await retry(async () => {
        expect(await browser.url()).toContain('/non-existent-page?id=1')
      })

      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )

      // The other link would have attempted to use the aliased entry. Ensure the browser ends up on the correct page
      await browser.loadPage(`${next.url}/mpa-navs`)
      await retry(async () => {
        expect(await browser.url()).toContain('/mpa-navs')
      })
      await browser.elementByCss("[href='/non-existent-page?id=2']").click()
      await retry(async () => {
        expect(await browser.url()).toContain('/non-existent-page?id=2')
      })
      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )
    })

    it('should work for route handlers', async () => {
      const browser = await next.browser('/mpa-navs')
      await browser.elementByCss("[href='/route-handler?param=1']").click()
      await retry(async () => {
        expect(await browser.url()).toContain('/route-handler?param=1')
      })

      await browser.loadPage(`${next.url}/mpa-navs`)
      await retry(async () => {
        expect(await browser.url()).toContain('/mpa-navs')
      })

      await browser.elementByCss("[href='/route-handler?param=2']").click()
      await retry(async () => {
        expect(await browser.url()).toContain('/route-handler?param=2')
      })
    })

    it('should work for navigating to pages dir', async () => {
      const browser = await next.browser('/mpa-navs')
      await browser.elementByCss("[href='/pages-dir?param=1']").click()

      await retry(
        async () => {
          expect(await browser.elementByCss('body').text()).toContain(
            'Hello from pages dir! 1'
          )
          expect(await browser.url()).toContain('/pages-dir?param=1')
        },
        10000,
        1000,
        'Waiting for pages-dir?param=1 to load'
      )

      await browser.loadPage(`${next.url}/mpa-navs`)
      await browser.elementByCss("[href='/pages-dir?param=2']").click()

      await retry(
        async () => {
          expect(await browser.elementByCss('body').text()).toContain(
            'Hello from pages dir! 2'
          )
          expect(await browser.url()).toContain('/pages-dir?param=2')
        },
        10000,
        1000,
        'Waiting for pages-dir?param=2 to load'
      )
    })
  })

  // Dev doesn't perform prefetching, so this test is skipped, as it relies on intercepting
  // prefetch network requests.
  if (!isNextDev) {
    describe.each([
      { path: '/', label: 'Without Middleware' },
      { path: '/with-middleware', label: 'With Middleware' },
    ])('$label', ({ path }) => {
      it('should correctly return different RSC data for full prefetches with different searchParam values', async () => {
        const rscRequestPromise = new Map<
          string,
          { resolve: () => Promise<void> }
        >()

        // Track prefetch requests to know when initial prefetching is done
        const prefetchRequests = new Set<string>()
        let prefetchResolve: (() => void) | undefined
        let prefetchDelayStarted = false
        const prefetchPromise = new Promise<void>((resolve) => {
          prefetchResolve = resolve
          // Fallback timeout to prevent hanging
          setTimeout(() => resolve(), 5000)
        })

        let interceptRequests = false
        const browser = await next.browser(path, {
          beforePageLoad(page) {
            page.route(
              (url) => {
                return url.pathname.includes('search-params')
              },
              async (route) => {
                const request = route.request()
                const headers = await request.allHeaders()
                const url = new URL(request.url())

                // Track prefetch requests during initial load
                if (headers['next-router-prefetch'] && !interceptRequests) {
                  const prefetchKey = url.pathname + url.search
                  prefetchRequests.add(prefetchKey)
                  await route.continue()

                  // Wait for initial prefetch burst to complete
                  // Add small delay after seeing prefetches to let any redirects complete
                  if (prefetchRequests.size >= 2 && !prefetchDelayStarted) {
                    prefetchDelayStarted = true
                    setTimeout(() => prefetchResolve?.(), 500)
                  }
                  return
                }

                // Normalize path to ignore differences between middleware and non-middleware cases
                const normalizedPath = url.pathname.replace(/\/someValue$/, '')
                const promiseKey =
                  normalizedPath + '?id=' + url.searchParams.get('id')

                if (!interceptRequests) {
                  return route.continue()
                }

                if (
                  headers['rsc'] === '1' &&
                  !headers['next-router-prefetch']
                ) {
                  // Create a promise that will be resolved by the later test code
                  let resolvePromise: () => void
                  const promise = new Promise<void>((res) => {
                    resolvePromise = res
                  })

                  if (rscRequestPromise.has(promiseKey)) {
                    throw new Error('Duplicate request')
                  }

                  rscRequestPromise.set(promiseKey, {
                    resolve: async () => {
                      await route.continue()
                      // wait a moment to ensure the response is received
                      await new Promise((res) => setTimeout(res, 500))
                      resolvePromise()
                    },
                  })

                  // Await the promise to effectively stall the request
                  await promise
                } else {
                  await route.continue()
                }
              }
            )
          },
        })

        const basePath = path === '/' ? '' : path
        const searchParamsPagePath = `${basePath}/search-params`

        // Wait for all expected prefetch requests to complete
        await prefetchPromise
        interceptRequests = true
        // The first link we click is "auto" prefetched.
        await browser
          .elementByCss(`[href="${searchParamsPagePath}?id=1"]`)
          .click()

        // We expect to click it and immediately see a loading state
        expect(await browser.elementById('loading').text()).toBe('Loading...')
        // We only resolve the dynamic request after we've confirmed loading exists,
        // to avoid a race where the dynamic request handles the loading state instead.
        let dynamicRequest = rscRequestPromise.get(
          `${searchParamsPagePath}?id=1`
        )

        expect(dynamicRequest).toBeDefined()

        // resolve the promise
        await dynamicRequest.resolve()
        dynamicRequest = undefined

        // Confirm the params are correct
        const params = await browser.waitForElementByCss('#params').text()
        expect(params).toBe('{"id":"1"}')

        await browser.elementByCss(`[href='${path}']`).click()

        // Do the exact same thing again, for another prefetch auto link, to ensure
        // loading works as expected and we get different search params
        await browser
          .elementByCss(`[href="${searchParamsPagePath}?id=2"]`)
          .click()
        expect(await browser.elementById('loading').text()).toBe('Loading...')
        dynamicRequest = rscRequestPromise.get(`${searchParamsPagePath}?id=2`)
        expect(dynamicRequest).toBeDefined()

        // resolve the promise
        await dynamicRequest.resolve()
        dynamicRequest = undefined

        const params2 = await browser.waitForElementByCss('#params').text()
        expect(params2).toBe('{"id":"2"}')

        // Dev mode doesn't perform full prefetches, so this test is conditional
        await browser.elementByCss(`[href='${path}']`).click()

        await browser
          .elementByCss(`[href="${searchParamsPagePath}?id=3"]`)
          .click()
        expect(rscRequestPromise.has(`${searchParamsPagePath}?id=3`)).toBe(
          false
        )
        // no need to resolve any dynamic requests, as this is a full prefetch
        const params3 = await browser.waitForElementByCss('#params').text()
        expect(params3).toBe('{"id":"3"}')
      })
    })

    // /search-params (full) to /search-params?id=1 (missing)
    // navigation will use loading from the full prefetch
    it('should re-use loading from "full" prefetch for param-full URL when navigating to param-less route', async () => {
      const rscRequestPromise = new Map<
        string,
        { resolve: () => Promise<void> }
      >()

      let interceptRequests = false
      const browser = await next.browser('/onclick-navs/version-1', {
        beforePageLoad(page) {
          page.route('**/search-params*', async (route) => {
            if (!interceptRequests) {
              return route.continue()
            }

            const request = route.request()
            const headers = await request.allHeaders()
            const url = new URL(request.url())
            const promiseKey =
              url.pathname +
              (url.searchParams.has('id')
                ? `?id=${url.searchParams.get('id')}`
                : '')

            if (headers['rsc'] === '1' && !headers['next-router-prefetch']) {
              // Create a promise that will be resolved by the later test code
              let resolvePromise: () => void
              const promise = new Promise<void>((res) => {
                resolvePromise = res
              })

              if (rscRequestPromise.has(promiseKey)) {
                throw new Error('Duplicate request')
              }

              rscRequestPromise.set(promiseKey, {
                resolve: async () => {
                  await route.continue()
                  // wait a moment to ensure the response is received
                  await new Promise((res) => setTimeout(res, 500))
                  resolvePromise()
                },
              })

              // Await the promise to effectively stall the request
              await promise
            } else {
              await route.continue()
            }
          })
        },
      })

      await browser.waitForIdleNetwork()
      interceptRequests = true

      // The button will trigger a router.push to the search-params route
      // we use a button to ensure there was no automatic prefetching of this URL
      await browser.elementByCss('button').click()

      // We expect to click it and immediately see a loading state
      expect(await browser.elementById('loading').text()).toBe('Loading...')

      // We only resolve the dynamic request after we've confirmed loading exists,
      // to avoid a race where the dynamic request handles the loading state instead.
      let dynamicRequest = rscRequestPromise.get('/search-params')
      expect(dynamicRequest).toBeDefined()

      // resolve the promise
      await dynamicRequest.resolve()
      dynamicRequest = undefined

      // Confirm the params are correct - we navigated to a page without params so we expect an empty object
      const params = await browser.waitForElementByCss('#params').text()
      expect(params).toBe('{}')

      await browser.back()

      // Navigating to the prefetch: true page should not trigger a new request and should immediately render the content
      await browser.elementByCss("[href='/search-params?id=1']").click()
      expect(rscRequestPromise.has('/search-params?id=1')).toBe(false)
      const params1 = await browser.waitForElementByCss('#params').text()
      expect(params1).toBe('{"id":"1"}')
    })

    // /search-params?id=1 (full) to /search-params (missing)
    // navigation will use loading from the full prefetch
    it('should re-use loading from "full" prefetch for param-less URL when navigating to param-full route', async () => {
      const rscRequestPromise = new Map<
        string,
        { resolve: () => Promise<void> }
      >()

      let interceptRequests = false
      const browser = await next.browser('/onclick-navs/version-2', {
        beforePageLoad(page) {
          page.route('**/search-params*', async (route) => {
            if (!interceptRequests) {
              return route.continue()
            }

            const request = route.request()
            const headers = await request.allHeaders()
            const url = new URL(request.url())
            const promiseKey =
              url.pathname +
              (url.searchParams.has('id')
                ? `?id=${url.searchParams.get('id')}`
                : '')

            if (headers['rsc'] === '1' && !headers['next-router-prefetch']) {
              // Create a promise that will be resolved by the later test code
              let resolvePromise: () => void
              const promise = new Promise<void>((res) => {
                resolvePromise = res
              })

              if (rscRequestPromise.has(promiseKey)) {
                throw new Error('Duplicate request')
              }

              rscRequestPromise.set(promiseKey, {
                resolve: async () => {
                  await route.continue()
                  // wait a moment to ensure the response is received
                  await new Promise((res) => setTimeout(res, 500))
                  resolvePromise()
                },
              })

              // Await the promise to effectively stall the request
              await promise
            } else {
              await route.continue()
            }
          })
        },
      })

      await browser.waitForIdleNetwork()
      interceptRequests = true

      // The button will trigger a router.push to the search-params?id=1 route
      // we use a button to ensure there was no automatic prefetching of this URL
      await browser.elementByCss('button').click()

      // We expect to click it and immediately see a loading state
      expect(await browser.elementById('loading').text()).toBe('Loading...')

      // We only resolve the dynamic request after we've confirmed loading exists,
      // to avoid a race where the dynamic request handles the loading state instead.
      let dynamicRequest = rscRequestPromise.get('/search-params?id=1')
      expect(dynamicRequest).toBeDefined()

      // resolve the promise
      await dynamicRequest.resolve()
      dynamicRequest = undefined

      // Confirm the params are correct
      const params = await browser.waitForElementByCss('#params').text()
      expect(params).toBe('{"id":"1"}')

      await browser.back()

      // Navigating to the prefetch: true page should not trigger a new request and should immediately render the content
      await browser.elementByCss("[href='/search-params']").click()
      expect(rscRequestPromise.has('/search-params')).toBe(false)
      const params1 = await browser.waitForElementByCss('#params').text()
      expect(params1).toBe('{}')
    })

    // /search-params?id=1 (full) to /search-params?id=2 (missing)
    // navigation will use loading from the full prefetch
    it('should re-use loading from "full" prefetch for param-full URL when navigating to param-full route', async () => {
      const rscRequestPromise = new Map<
        string,
        { resolve: () => Promise<void> }
      >()

      let interceptRequests = false
      const browser = await next.browser('/onclick-navs/version-3', {
        beforePageLoad(page) {
          page.route('**/search-params*', async (route) => {
            if (!interceptRequests) {
              return route.continue()
            }

            const request = route.request()
            const headers = await request.allHeaders()
            const url = new URL(request.url())
            const promiseKey =
              url.pathname +
              (url.searchParams.has('id')
                ? `?id=${url.searchParams.get('id')}`
                : '')

            if (headers['rsc'] === '1' && !headers['next-router-prefetch']) {
              // Create a promise that will be resolved by the later test code
              let resolvePromise: () => void
              const promise = new Promise<void>((res) => {
                resolvePromise = res
              })

              if (rscRequestPromise.has(promiseKey)) {
                throw new Error('Duplicate request')
              }

              rscRequestPromise.set(promiseKey, {
                resolve: async () => {
                  await route.continue()
                  // wait a moment to ensure the response is received
                  await new Promise((res) => setTimeout(res, 500))
                  resolvePromise()
                },
              })

              // Await the promise to effectively stall the request
              await promise
            } else {
              await route.continue()
            }
          })
        },
      })

      await browser.waitForIdleNetwork()
      interceptRequests = true

      // The button will trigger a router.push to the search-params?id=2 route
      // we use a button to ensure there was no automatic prefetching of this URL
      await browser.elementByCss('button').click()

      // We expect to click it and immediately see a loading state
      expect(await browser.elementById('loading').text()).toBe('Loading...')

      // We only resolve the dynamic request after we've confirmed loading exists,
      // to avoid a race where the dynamic request handles the loading state instead.
      let dynamicRequest = rscRequestPromise.get('/search-params?id=2')
      expect(dynamicRequest).toBeDefined()

      // resolve the promise
      await dynamicRequest.resolve()
      dynamicRequest = undefined

      // Confirm the params are correct
      const params = await browser.waitForElementByCss('#params').text()
      expect(params).toBe('{"id":"2"}')

      await browser.back()

      // Navigating to the prefetch: true page should not trigger a new request and should immediately render the content
      await browser.elementByCss("[href='/search-params?id=1']").click()
      expect(rscRequestPromise.has('/search-params?id=1')).toBe(false)
      const params1 = await browser.waitForElementByCss('#params').text()
      expect(params1).toBe('{"id":"1"}')
    })
  }
})
