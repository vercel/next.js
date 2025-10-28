import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache prefetch scheduling', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is disabled', () => {})
    return
  }

  it('increases the priority of a viewport-initiated prefetch on hover', async () => {
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

  it('prioritizes prefetching the route trees before the segments', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/cancellation', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    const checkbox = await browser.elementByCss('input[type="checkbox"]')

    await act(async () => {
      // Reveal the links to start prefetching
      await checkbox.click()
    }, [
      // Assert on the order that the prefetches requests are
      // initiated. We don't need to assert on every single prefetch response;
      // this will only check the order of the ones that we've listed.
      //
      // To detect when the route tree is prefetched, we check for a string
      // that is known to be present in the target page's viewport config
      // (which is included in the route tree response). In this test app, the
      // page number is used in the media query of the theme color. E.g. for
      // page 1, the viewport includes:
      //
      // <meta name="theme-color" media="(min-width: 1px)" content="light"/>

      // First we should prefetch all the route trees:
      { includes: '(min-width: 7px)' },
      { includes: '(min-width: 6px)' },
      { includes: '(min-width: 5px)' },
      { includes: '(min-width: 4px)' },
      { includes: '(min-width: 3px)' },

      // Then we should prefetch the segments:
      { includes: 'Content of page 7' },
      { includes: 'Content of page 6' },
      { includes: 'Content of page 5' },
      { includes: 'Content of page 4' },
      { includes: 'Content of page 3' },
    ])
  })

  it('reserve special bandwidth for the most recently hovered link', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/cancellation', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    const checkbox = await browser.elementByCss('input[type="checkbox"]')
    await act(async () => {
      // Reveal the links to start prefetching, but block the responses from
      // reaching the client. This will initiate prefetches for the route
      // trees, but it won't start prefetching any segment data yet until the
      // trees have loaded.
      await act(async () => {
        await checkbox.click()
      }, 'block')

      // At this point, the network queue is already at max capacity, so
      // revealing more links won't initiate any new requests.
      await act(async () => {
        const showMoreLinksButton = await browser.elementById('show-more-links')
        await showMoreLinksButton.click()
      }, 'no-requests')

      // However, when hovering over a link, the prefetch task is allowed to
      // exceed the default limit. So hovering over a link does initiate a
      // new request.
      await act(async () => {
        // Hover over a link. This will initiate a request for the route tree,
        // but before we're able to fetch the segments, we'll have already
        // hovered over a different link.
        const link2 = await browser.elementByCss('a[href="/cancellation/2"]')
        await link2.hover()

        // Immediately hover over a different link.
        const link3 = await browser.elementByCss('a[href="/cancellation/3"]')
        await link3.hover()
      }, [
        // The most recently hovered link is allowed to finish loading its
        // segment data.
        { includes: 'Content of page 3' },
        // The previously hovered link was downgraded to the default priority,
        // so it should still be blocked.
        { includes: 'Content of page 2', block: 'reject' },
      ])
    }, [
      // Assert that everything else proceeds in the expected order. We don't
      // need to assert on every single prefetch response; I picked just a few
      // of them.

      // The previously hovered link is the next to finish loading, because
      // even though it was downgraded to the default priority, it was still
      // moved ahead of the other default tasks.
      { includes: 'Content of page 2' },
      // Next are the links that were revealed by the "Show More" button.
      { includes: 'Content of page 8' },
      // Then the rest.
      { includes: 'Content of page 5' },
    ])
  })

  it(
    'cancels a viewport-initiated prefetch if the link leaves the viewport ' +
      'before it finishes',
    async () => {
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
          // reaching the client. Because the router limits the number of
          // concurrent prefetches, not all the links will start prefetching —
          // some of them will remain in the queue, waiting for additional
          // network bandwidth. This test demonstrates that those prefetches
          // will be canceled on viewport exit, too.
          await act(async () => {
            await checkbox.click()
          }, 'block')

          // Before the prefetch finishes, click the checkbox again to hide
          // the link.
          await checkbox.click()
        },
        // When the outer `act` scope finishes, the route tree prefetch will
        // continue. Normally when the router is done prefetching the route
        // tree, it will proceed to prefetching the segments. However, since
        // the link is no longer visible, it should stop prefetching.
        //
        // Assert that no additional network requests are initiated in this
        // outer scope. If this fails, it suggests that the prefetches were not
        // canceled when the links left the viewport.
        'no-requests'
      )
    }
  )

  it("reschedules a link's prefetch when it re-enters the viewport", async () => {
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
        // reaching the client. Because the router limits the number of
        // concurrent prefetches, not all the links will start prefetching —
        // some of them will remain in the queue, waiting for additional
        // network bandwidth. This test demonstrates that those prefetches
        // will be canceled on viewport exit, too.
        await act(async () => {
          await checkbox.click()
        }, 'block')

        // Before the prefetch finishes, click the checkbox again to hide
        // the link.
        await checkbox.click()
      },
      // When the outer `act` scope finishes, the route tree prefetch will
      // continue. Normally when the router is done prefetching the route
      // tree, it will proceed to prefetching the segments. However, since
      // the link is no longer visible, it should stop prefetching.
      //
      // Assert that no additional network requests are initiated in this
      // outer scope. If this fails, it suggests that the prefetches were not
      // canceled when the links left the viewport.
      'no-requests'
    )

    // Now we'll reveal the links again to verify that the prefetch tasks are
    // rescheduled, after having been canceled.
    await act(
      async () => {
        await checkbox.click()
      },
      // Don't need to assert on all the prefetch responses. I picked an
      // arbitrary one.
      { includes: 'Content of page 5' }
    )
  })
})
