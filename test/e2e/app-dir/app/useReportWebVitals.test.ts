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

  it('should report LCP for idle users when page becomes hidden', async () => {
    await next.fetch('/report-web-vitals')

    const reportedMetrics: string[] = []
    let lcpReported = false
    let pageInstance: any = null

    await next.browser('/report-web-vitals', {
      beforePageLoad: (page) => {
        pageInstance = page
        page.route('https://example.vercel.sh/vitals', (route) => {
          const body = route.request().postData()
          if (body) {
            const params = new URLSearchParams(body)
            const metricName = params.get('name')
            if (metricName) {
              reportedMetrics.push(metricName)
              if (metricName === 'LCP') {
                lcpReported = true
              }
            }
          }
          route.fulfill()
        })
      },
    })

    // Wait for page to load and LCP element to be visible
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Simulate page becoming hidden (visibilitychange event)
    await pageInstance.evaluate(() => {
      // Trigger visibilitychange event
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Wait a bit for the event to be processed
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Check that LCP was reported
    await check(async () => {
      expect(lcpReported).toBe(true)
      expect(reportedMetrics).toContain('LCP')
      return 'success'
    }, 'success')
  })
})
