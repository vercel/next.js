import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from 'next-test-utils'

// A prefetch up to a loading boundary doesn't deliver the segments below the
// boundary. A navigation that starts during that prefetch still shows the
// boundary, and gets those segments itself.
// @force-gate prefetching
describe('navigating while a loading boundary prefetch is in flight', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('shows the loading boundary when the prefetch lands before the navigation', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/shared', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    await act(async () => {
      await act(
        async () => {
          // Reveal the link, and hold its prefetch.
          await act(
            async () => {
              await browser
                .elementByCss(
                  'input[data-link-accordion="/shared/destination"]'
                )
                .click()
            },
            { includes: 'Loading destination...', block: true }
          )
          // Navigate while the prefetch is in flight, and hold the
          // navigation's own response.
          await browser.elementByCss('a[href="/shared/destination"]').click()
        },
        { includes: 'Destination content', block: true }
      )

      // The prefetch has landed, but the navigation's response hasn't.
      expect(await browser.elementById('loading').text()).toBe(
        'Loading destination...'
      )
    })

    expect(await browser.elementById('destination').text()).toBe(
      'Destination content'
    )
    await retry(async () => {
      expect(await browser.eval('document.title')).toBe('Destination title')
    })
  })

  it('keeps the title when navigating twice while prefetches are in flight', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/shared', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    await act(async () => {
      await act(
        async () => {
          // Reveal both links, and hold their prefetches. The second link's
          // segments above the loading boundary are already on their way, so
          // its prefetch may contain nothing but its route tree. Its route
          // tree prefetch carries the same tree, so claim that one first.
          await act(async () => {
            await browser
              .elementByCss('input[data-link-accordion="/shared/destination"]')
              .click()
            await browser
              .elementByCss(
                'input[data-link-accordion="/shared/destination/detail"]'
              )
              .click()
          }, [
            { includes: '"detail"', kind: 'static' },
            { includes: 'Loading destination...', block: true },
            { includes: '"detail"', block: true },
          ])
          // Navigate twice in a row while those prefetches are in flight. The
          // second navigation starts before the first one commits. Hold the
          // second navigation's own response.
          await browser.elementByCss('a[href="/shared/destination"]').click()
          await browser
            .elementByCss('a[href="/shared/destination/detail"]')
            .click()
        },
        { includes: 'Detail content', block: true }
      )
    })

    expect(await browser.elementById('detail').text()).toBe('Detail content')
    await retry(async () => {
      expect(await browser.eval('document.title')).toBe('Detail title')
    })
  })
})
