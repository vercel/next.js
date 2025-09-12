import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('useReportWebVitals hook', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: __dirname,
      skipStart: true,
      env: {},
      dependencies: {
        nanoid: '4.0.1',
      },
    })

    await next.start()
  })
  afterAll(() => next.destroy())

  // Analytics events are only sent in production
  it('should send web-vitals', async () => {
    await next.fetch('/report-web-vitals')

    let eventsCount = 0
    const browser = await next.browser('/report-web-vitals', {
      beforePageLoad: (page) => {
        page.route('https://example.vercel.sh/vitals', (route) => {
          eventsCount += 1
          route.fulfill()
        })
      },
    })

    // Refresh will trigger CLS and LCP. When page loads FCP and TTFB will trigger:
    await browser.refresh()

    // After interaction LCP and FID will trigger
    await browser.elementById('btn').click()

    // Make sure all registered events in performance-relayer has fired
    await check(async () => {
      expect(eventsCount).toBeGreaterThanOrEqual(6)
      return 'success'
    }, 'success')
  })
})
