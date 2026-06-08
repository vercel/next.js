import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('App Shell prefetching - global unstable_eager', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('does NOT skip the Speculative prefetch when partialPrefetching is "unstable_eager" globally', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // /posts/[id] has no per-segment prefetch config, but the global
    // `partialPrefetching: 'unstable_eager'` makes it eager. Reveal /posts/1 to
    // prime the shared app shell.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/posts/1"]')
        .click()
    })

    // Reveal /posts/2 — a different param, shell already cached. Because the
    // global config makes the route eager, the per-link Speculative prefetch
    // still fires for param 2 (a single request carrying "Eager post 2"),
    // rather than firing no requests as a non-eager route's second link would.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/posts/2"]')
          .click()
      },
      { includes: 'Eager post 2' }
    )
  })
})
