import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import {
  RSC_CONTENT_TYPE_HEADER,
  RSC_VARY_HEADER_VALUE,
} from 'next/dist/client/components/app-router-headers'

describe('rsc-response-middleware-no-cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not contain "RSC, Next-Router-State-Tree, Next-Url, Accept-Encoding" as the Vary header value for non-RSC requests', async () => {
    const browser = await next.browser('/')

    const rscRequestsVaryHeaderValues: string[] = []
    browser.on('response', (res) => {
      const headers = res.headers()
      if (headers['content-type'] === RSC_CONTENT_TYPE_HEADER) {
        rscRequestsVaryHeaderValues.push(headers['vary'])
      }
    })

    // no RSC requests on home page
    expect(rscRequestsVaryHeaderValues.length).toBe(0)
    expect(
      rscRequestsVaryHeaderValues.every(
        (value) => value !== RSC_VARY_HEADER_VALUE
      )
    ).toBe(true)
  })

  it('should contain "RSC, Next-Router-State-Tree, Next-Url, Accept-Encoding" as the Vary header value for RSC requests', async () => {
    const browser = await next.browser('/')

    const rscRequestsVaryHeaderValues: string[] = []
    browser.on('response', (res) => {
      const headers = res.headers()
      if (headers['content-type'] === RSC_CONTENT_TYPE_HEADER) {
        rscRequestsVaryHeaderValues.push(headers['vary'])
      }
    })

    // Click redirect link
    const link = await browser.elementByCss('a')
    await link.click()

    await waitFor(1000)

    console.log('sadjakd', rscRequestsVaryHeaderValues)
    // The rewrite source url should contain the rsc query
    expect(rscRequestsVaryHeaderValues.length).toBeGreaterThan(0)
    expect(
      rscRequestsVaryHeaderValues.every(
        (value) => value === RSC_VARY_HEADER_VALUE
      )
    ).toBe(true)
  })
})
