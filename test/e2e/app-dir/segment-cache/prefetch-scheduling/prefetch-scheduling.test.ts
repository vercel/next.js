import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from '../router-act'

describe('segment cache prefetch scheduling', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('prefetching is disabled', () => {})
    return
  }

  it('increases the priority of a viewport-initiated prefetch on hover', async () => {
    // TODO: This works because we bump the prefetch task to the front of the
    // queue on mouseenter. But there's a flaw: if another link enters the
    // viewport while the first link is still being hovered, the second link
    // will go ahead of it in the queue. In other words, we currently don't
    // treat mouseenter as a higher priority signal than "viewport enter". To
    // fix this, we need distinct priority levels for hover and viewport; the
    // last-in-first-out strategy is not sufficient for the desired behavior.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/cancellation', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    const checkbox = await browser.elementByCss('input[type="checkbox"]')
    await act(
      async () => {
        // Reveal the links to start prefetching, but block the responses from
        // reaching the client. This will initiate prefetches for the route
        // trees, but it won't start prefetching any segment data yet until the
        // trees have loaded.
        await act(async () => {
          await checkbox.click()
        }, 'block')

        // Hover over a link to increase its relative priority.
        const link2 = await browser.elementByCss('a[href="/cancellation/2"]')
        await link2.hover()

        // Hover over a different link to increase its relative priority.
        const link5 = await browser.elementByCss('a[href="/cancellation/5"]')
        await link5.hover()
      },
      // Assert that the segment data is prefetched in the expected order.
      [
        // The last link we hovered over should be the first to prefetch.
        { includes: 'Content of page 5' },
        // The second-to-last link we hovered over should come next.
        { includes: 'Content of page 2' },
        // Then all the other links come after that. (We don't need to assert
        // on every single prefetch response. I picked one of them arbitrarily.)
        { includes: 'Content of page 4' },
      ]
    )
  })
})
