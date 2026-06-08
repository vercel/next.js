import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('partial prefetching - deep subtree-hint propagation', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Prefetching only happens in production builds.
    it('is skipped in dev mode', () => {})
    return
  }

  // NOTE: This is a regression test, so the description mentions implementation
  // details. However, it's written in such a way that it should still be value
  // even if the implementation details change.
  //
  // The route `/a/b/c` opts into Partial Prefetching on its leaf page via
  // `export const unstable_prefetch = 'partial'`. The
  // `SubtreeHasPartialPrefetching` hint originates on that leaf and must
  // propagate up through the `/a/b` and `/a` layout segments to the ROOT of
  // the route tree, because the prefetch scheduler reads the hint at the root
  // to decide whether a `prefetch={true}` link does a full prefetch (which
  // includes dynamic data) or a partial/PPR prefetch (static only).
  //
  // If propagation is broken at any level, the root is missing the hint, the
  // prefetch becomes a full prefetch, and "Deep dynamic" arrives — failing the
  // `block: 'reject'` assertion below.
  it('downgrades a prefetch={true} to a partial prefetch when a deeply nested segment opts in', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link to trigger its prefetch. The Link has prefetch={true},
    // and the target route opts into partial prefetching on a deeply nested
    // segment. The prefetch should include the static shell, but NOT the
    // dynamic data.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/a/b/c"]'
      )
      await toggle.click()
    }, [
      { includes: 'Deep static' },
      { includes: 'Deep dynamic', block: 'reject' },
    ])
  })
})
