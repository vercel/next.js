import { nextTestSetup } from 'e2e-utils'

// TODO(NAR-423): Migrate to Cache Components.
describe.skip('prefetch-navigation', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('is skipped in dev because there are no prefetches', () => {})
    return
  }

  it('should render the prefetch without waiting for the RSC request', async () => {
    const rscRequestPromise = new Map<
      string,
      { resolve: () => Promise<void> }
    >()
    const browser = await next.browser('/catch-all/1', {
      beforePageLoad(page) {
        page.route('**/catch-all/**', async (route) => {
          const request = route.request()
          const headers = await request.allHeaders()
          const url = new URL(request.url())
          const pathname = url.pathname

          if (headers['rsc'] === '1' && !headers['next-router-prefetch']) {
            // Create a promise that will be resolved by the later test code
            let resolvePromise: () => void
            const promise = new Promise<void>((res) => {
              resolvePromise = res
            })

            if (rscRequestPromise.has(pathname)) {
              throw new Error('Duplicate request')
            }

            rscRequestPromise.set(pathname, {
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

    // Confirm the initial slug params are correct & present
    let initialParams = await browser.elementById('params').text()
    expect(initialParams).toBe('Params: {"slug":["1"]}')
    await browser.waitForElementByCss('#dynamic-page-1')

    await browser.waitForIdleNetwork()

    // Navigate to the other page
    await browser.elementByCss('a[href="/catch-all/2"]').click()
    await browser.waitForElementByCss('#dynamic-page-2')

    // In `beforePageLoad`, we've stalled the RSC request for this page.
    // We should still expect to see the prefetch applied while the request is pending.
    let targetPageParams = await browser.elementById('params').text()
    expect(targetPageParams).toBe('Params: {"slug":["2"]}')

    // Resolve the request to allow the page to finish loading
    await rscRequestPromise.get('/catch-all/2').resolve()

    // Now go back to the first page to make sure that the server seeded
    // prefetch cache entry behaves the same as one that is retrieved
    // from the client prefetch.
    await browser.elementByCss('a[href="/catch-all/1"]').click()
    await browser.waitForElementByCss('#dynamic-page-1')

    targetPageParams = await browser.elementById('params').text()
    expect(targetPageParams).toBe('Params: {"slug":["1"]}')
  })
})
