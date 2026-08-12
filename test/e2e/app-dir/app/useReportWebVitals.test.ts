import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

type ReportedMetric = Record<string, string>

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

  // The reporter posts every metric to `https://example.vercel.sh/vitals`, which
  // is intercepted here so that the reported metrics can be asserted on.
  async function openReportWebVitalsPage() {
    const metrics: ReportedMetric[] = []

    const browser = await next.browser('/report-web-vitals', {
      beforePageLoad: (page) => {
        page.route('https://example.vercel.sh/vitals', (route) => {
          metrics.push(
            Object.fromEntries(
              new URLSearchParams(route.request().postData() ?? '')
            )
          )
          route.fulfill()
        })
      },
    })

    return { browser, metrics }
  }

  // Analytics events are only sent in production
  it('should send web-vitals', async () => {
    await next.fetch('/report-web-vitals')

    const { browser, metrics } = await openReportWebVitalsPage()

    // Interacting with the page is required for INP to be measured.
    await browser.elementById('btn').click()

    // Refreshing hides the current page, which finalizes CLS, INP and LCP for
    // it. Loading the page again reports FCP and TTFB another time.
    await browser.refresh()

    await retry(async () => {
      expect(metrics.map((metric) => metric.name)).toEqual(
        expect.arrayContaining(['CLS', 'FCP', 'INP', 'LCP', 'TTFB'])
      )
    })

    // Metrics are reported for the URL they were measured for, which is not
    // necessarily the URL of the page at the time of reporting.
    for (const metric of metrics) {
      expect(metric.navigationURL).toContain('/report-web-vitals')
    }
  })

  it('should send web-vitals for soft navigations', async () => {
    await next.fetch('/report-web-vitals/destination')

    const { browser, metrics } = await openReportWebVitalsPage()

    // Soft navigations are only measured by browsers that support the Soft
    // Navigations API (Chromium 151+). `web-vitals` feature detects it, and
    // keeps reporting metrics for the initial page load only otherwise.
    const supportsSoftNavigations = await browser.eval(
      () =>
        PerformanceObserver.supportedEntryTypes.includes('soft-navigation') &&
        typeof (globalThis as any).PerformanceSoftNavigation?.prototype
          ?.getLargestInteractionContentfulPaint === 'function'
    )

    await browser.elementById('to-destination').click()

    await retry(async () => {
      expect(await browser.elementById('destination').text()).toBe(
        'Destination'
      )
    })

    // Hiding the page finalizes the metrics that are still pending for it.
    await browser.refresh()

    await retry(async () => {
      expect(metrics.map((metric) => metric.name)).toEqual(
        expect.arrayContaining(['CLS', 'FCP', 'LCP', 'TTFB'])
      )
    })

    const softNavigationMetrics = metrics.filter(
      (metric) => metric.navigationType === 'soft-navigation'
    )

    if (!supportsSoftNavigations) {
      expect(softNavigationMetrics).toEqual([])
      return
    }

    // The Core Web Vitals are measured again for the soft navigation, and are
    // reported for the URL that was navigated to.
    expect(softNavigationMetrics.map((metric) => metric.name)).toEqual(
      expect.arrayContaining(['LCP'])
    )

    for (const metric of softNavigationMetrics) {
      expect(metric.navigationURL).toContain('/report-web-vitals/destination')
    }
  })
})
