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
      beforePageLoad: async (currentPage) => {
        await collectWebVitals(currentPage, events)
      },
    })

    // Refresh will report another set of navigation metrics.
    await browser.refresh()

    // Exercise the interaction reporting path.
    await browser.elementById('btn').click()

    // Make sure all registered events in performance-relayer has fired
    await retry(() => {
      expect(events.length).toBeGreaterThanOrEqual(4)
    })
    expect(events.map((event) => event.name)).not.toContain('FID')
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          navigationURL: expect.stringMatching(/\/report-web-vitals$/),
        }),
      ])
    )
  })
})
