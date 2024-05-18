import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-prefetching', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not re-fetch data for the __DEFAULT__ segments when navigating within a dynamic segment', async () => {
    let prefetchRequests = []
    let rscRequests = []
    const browser = await next.browser('/a', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          return request.allHeaders().then((headers) => {
            if (headers['Next-Router-Prefetch'.toLowerCase()] === '1') {
              prefetchRequests.push(request.url())
            } else if (headers['RSC'.toLowerCase()] === '1') {
              rscRequests.push(request.url())
            }
          })
        })
      },
    })

    expect(await browser.elementById('letter-page').text()).toBe('a')
    expect(await browser.elementById('letter-parallel').text()).toBe('a')

    await retry(() => {
      // we should see 25 prefetch requests for each letter of the alphabet (excluding the current)
      expect(prefetchRequests).toHaveLength(25)
      // and 0 RSC requests since we're not navigating to a different dynamic segment
      expect(rscRequests).toHaveLength(0)
    })

    prefetchRequests = []

    await browser.elementByCss('[href="/b"]').click()

    await retry(() => {
      // Navigating to a new dynamic segment should trigger any additional prefetch requests
      expect(prefetchRequests).toHaveLength(0)

      // but we except 2 RSC requests for the new page:
      // - one for the `children` slot
      // - one for the active parallel slot
      // TODO: It would be nice to achieve this in a single request, but it currently isn't possible,
      // because the router will see missing data for both slots simultaneously and kick off two separate requests.
      // PPR doesn't have this issue because it doesn't perform the "lazy fetch" in layout-router.
      expect(rscRequests).toHaveLength(
        process.env.__NEXT_EXPERIMENTAL_PPR ? 1 : 2
      )
    })

    expect(await browser.elementById('letter-page').text()).toBe('b')
    expect(await browser.elementById('letter-parallel').text()).toBe('b')
  })
})
