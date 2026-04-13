import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from '@next/router-act'

describe('segment cache - root params segment prefetch', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: { '@next/router-act': 'latest' },
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

    // Check that %5BrootParam%5D does not appear in the response bodies
    // outside of .js chunk paths. Webpack encodes brackets in directory
    // names when generating chunk filenames (e.g.
    // static/chunks/app/%5BrootParam%5D/layout-xxx.js), which is
    // expected. What we're checking for is encoded placeholders in the
    // actual RSC data — those should use unencoded [rootParam].
    const encodedPlaceholderOutsideChunkPaths = /%5BrootParam%5D(?!.*\.js["\]])/
    expect(
      settledSegmentPrefetchBodies.some((body) =>
        encodedPlaceholderOutsideChunkPaths.test(body)
      )
    ).toBe(false)
  })
})
