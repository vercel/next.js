import { nextTestSetup } from 'e2e-utils'
import type { Route, Page } from 'playwright'

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

  // Dev doesn't perform prefetching, so this test is skipped, as it relies on intercepting
  // prefetch network requests.
  if (!isNextDev) {
    it('should correctly return different RSC data for full prefetches with different searchParam values', async () => {
      const rscRequestPromise = new Map<
        string,
        { resolve: () => Promise<void> }
      >()

      let interceptRequests = false
      const browser = await next.browser('/', {
        beforePageLoad(page: Page) {
          page.route('**/search-params*', async (route: Route) => {
            if (!interceptRequests) {
              return route.continue()
            }

            const request = route.request()
            const headers = await request.allHeaders()
            const url = new URL(request.url())
            const promiseKey =
              url.pathname + '?id=' + url.searchParams.get('id')

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
      // The first link we click is "auto" prefetched.
      await browser.elementByCss('[href="/search-params?id=1"]').click()

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

      await browser.elementByCss("[href='/']").click()

      // Do the exact same thing again, for another prefetch auto link, to ensure
      // loading works as expected and we get different search params
      await browser.elementByCss('[href="/search-params?id=2"]').click()
      expect(await browser.elementById('loading').text()).toBe('Loading...')
      dynamicRequest = rscRequestPromise.get('/search-params?id=2')
      expect(dynamicRequest).toBeDefined()

      // resolve the promise
      await dynamicRequest.resolve()
      dynamicRequest = undefined

      const params2 = await browser.waitForElementByCss('#params').text()
      expect(params2).toBe('{"id":"2"}')

      // Dev mode doesn't perform full prefetches, so this test is conditional
      await browser.elementByCss("[href='/']").click()

      await browser.elementByCss('[href="/search-params?id=3"]').click()
      expect(rscRequestPromise.has('/search-params?id=3')).toBe(false)
      // no need to resolve any dynamic requests, as this is a full prefetch
      const params3 = await browser.waitForElementByCss('#params').text()
      expect(params3).toBe('{"id":"3"}')
    })
  }
})
