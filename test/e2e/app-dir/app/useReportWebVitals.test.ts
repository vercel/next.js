import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

describe('useReportWebVitals hook', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {},
    dependencies: {
      nanoid: '4.0.1',
    },
  })

  beforeAll(async () => {
    await next.start()
  })

  function collectWebVitals(page: Page, events: Array<Record<string, string>>) {
    return page.route('https://example.vercel.sh/vitals', async (route) => {
      events.push(
        Object.fromEntries(
          new URLSearchParams(route.request().postData() ?? '')
        )
      )
      await route.fulfill()
    })
  }

  // Analytics events are only sent in production
  it('should send web-vitals', async () => {
    await next.fetch('/report-web-vitals')

    const events: Array<Record<string, string>> = []
    const browser = await next.browser('/report-web-vitals', {
      beforePageLoad: (page) => collectWebVitals(page, events),
    })

    // Refresh will trigger CLS and LCP. When page loads FCP and TTFB will trigger:
    await browser.refresh()

    // After interaction LCP and INP will trigger
    await browser.elementById('btn').click()

    // Make sure all registered events in performance-relayer has fired
    await retry(() => {
      expect(events.length).toBeGreaterThanOrEqual(5)
    })
    expect(events.some((event) => event.name === 'FID')).toBe(false)
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          navigationURL: expect.stringMatching(/\/report-web-vitals$/),
        }),
      ])
    )
  })

  it('should send web-vitals for soft navigations', async () => {
    const events: Array<Record<string, string>> = []
    const browser = await next.browser('/report-web-vitals', {
      beforePageLoad: (page) => collectWebVitals(page, events),
    })

    const supportsSoftNavigations = await browser.eval(
      `PerformanceObserver.supportedEntryTypes.includes('soft-navigation') &&
        typeof globalThis.PerformanceSoftNavigation?.prototype
          ?.getLargestInteractionContentfulPaint === 'function'`
    )

    if (!supportsSoftNavigations) {
      return
    }

    await browser
      .elementByCss('[href="/report-web-vitals/destination"]')
      .click()
    await browser.waitForElementByCss('h2')
    // A trusted interaction finalizes the destination's LCP metric.
    await browser.elementById('btn').click()

    await retry(() => {
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            navigationType: 'soft-navigation',
            navigationURL: expect.stringMatching(
              /\/report-web-vitals\/destination$/
            ),
          }),
        ])
      )
    })
  })
})
