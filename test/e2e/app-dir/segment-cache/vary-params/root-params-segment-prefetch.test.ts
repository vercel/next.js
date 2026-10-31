import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache - root params segment prefetch', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('prefetching is disabled in dev mode', () => {})
    return
  }

  it('does not encode root param placeholders in segment-prefetch responses', async () => {
    let act: ReturnType<typeof createRouterAct>
    const segmentPrefetchBodies: Array<Promise<string>> = []
    const browser = await next.browser('/root-params', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
        p.on('response', (response) => {
          const request = response.request()
          if (request.headers()['next-router-segment-prefetch']) {
            segmentPrefetchBodies.push(response.text().catch(() => ''))
          }
        })
      },
    })

    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/aaa"]'
        )
        await toggle.click()
      },
      { includes: 'Root param page content - param: aaa' }
    )

    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/bbb"]'
        )
        await toggle.click()
      },
      { includes: 'Root param page content - param: bbb' }
    )

    const settledSegmentPrefetchBodies = await Promise.all(
      segmentPrefetchBodies
    )

    expect(settledSegmentPrefetchBodies.length).toBeGreaterThan(0)
    expect(
      settledSegmentPrefetchBodies.some((body) =>
        body.includes('%5BrootParam%5D')
      )
    ).toBe(false)
  })
})
