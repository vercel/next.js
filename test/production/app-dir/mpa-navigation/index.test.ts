import { createNextDescribe } from 'e2e-utils'
import { retry } from 'next-test-utils'

createNextDescribe(
  'app-dir mpn-navigation',
  {
    files: __dirname,
  },
  ({ next }) => {
    // this test is pretty hard to test in playwright, so most of the heavy lifting is in the page component itself
    // it triggers a hover on a link to initiate a prefetch request every second, and so we check that
    // it doesn't repeatedly initiate the mpa navigation request
    it('should not continuously initiate a mpa navigation to the same URL when router state changes', async () => {
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
      await retry(async () => {
        expect(requestCount).toBe(1)
      }, 6 * 1000)
    })
  }
)
