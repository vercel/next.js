import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'web-vitals',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should report web vitals', async () => {
      let eventsCount = 0
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          page.route('https://report-web-vitals.com', (route) => {
            eventsCount += 1
            route.fulfill()
          })
        },
      })

      // Refresh will trigger CLS and LCP. When page loads FCP and TTFB will trigger:
      await browser.refresh()

      // After interaction LCP and FID will trigger
      await browser.elementByCss('button').click()

      // Make sure all registered events in performance-relayer has fired
      await check(() => eventsCount, /10/)
    })
  }
)
