import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import { RSC_CONTENT_TYPE_HEADER } from 'next/dist/client/components/app-router-headers'

describe('rsc-response-middleware-no-cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not contain RSC as one of the values in the Vary header for non-RSC requests', async () => {
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
    // rscRequestsVaryHeaderValues should not contain RSC as a substring
    expect(
      rscRequestsVaryHeaderValues.every((value) => !value.includes('RSC'))
    ).toBe(true)
  })

  it('should contain RSC as one of the values in the Vary header for RSC requests', async () => {
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

    // The rewrite source url should contain the rsc query
    expect(rscRequestsVaryHeaderValues.length).toBeGreaterThan(0)
    // rscRequestsVaryHeaderValues should contain RSC as a substring
    expect(
      rscRequestsVaryHeaderValues.some((value) => value.includes('RSC'))
    ).toBe(true)
  })
})
