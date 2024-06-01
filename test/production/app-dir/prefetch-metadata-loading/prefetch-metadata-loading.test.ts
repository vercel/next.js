import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir - prefetch-metadata-loading', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function browserWithRSCRequests(pathname, rscRequests) {
    const browser = await next.browser(pathname, {
      beforePageLoad(page) {
        page.on('response', async (res) => {
          const req = res.request()
          const headers = await req.allHeaders()
          if (headers['RSC'.toLowerCase()] === '1') {
            try {
              const isPrefetch =
                headers['Next-Router-Prefetch'.toLowerCase()] === '1'
              // Skip reading prefetching responses as it causes error in test
              const text = isPrefetch ? null : (await res.body()).toString()
              rscRequests.push({
                url: req.url(),
                response: text,
                isPrefetch,
              })
            } catch (err) {
              console.error('Failed to get response', err)
            }
          }
        })
      },
    })
    return browser
  }

  it('should contain page data in RSC navigation response when prefetch and metadata are defined', async () => {
    const url = '/metadata-prefetch'
    const rscRequests = []
    const browser = await browserWithRSCRequests('/', rscRequests)
    await browser.waitForElementByCss('#metadata-prefetch')

    // Wait for 1st auto prefetch request
    await retry(async () => {
      expect(rscRequests.length).toEqual(1)
      expect(rscRequests[0].isPrefetch).toBe(true)
    })

    await browser.elementByCss('#metadata-prefetch').click()

    // Wait for the page to be navigated to, and the navigation request is initiated
    await retry(async () => {
      const pageContentTitle = await browser.waitForElementByCss('h1').text()
      expect(pageContentTitle).toBe('Page content')
      expect(await browser.url()).toBe(`${next.url}${url}`)
      expect(rscRequests.length).toEqual(2)
    })

    // All RSC requests should contain loading.js content
    const navigationRequest = rscRequests[1]
    expect(navigationRequest.url).toContain(url)
    // Should always contain page content
    expect(navigationRequest.response).toContain('Page content')
  })
})
