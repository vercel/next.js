import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache - static shell vary params regression', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Depends on build-time prerenders, which don't exist in dev.
    test('skipped in dev mode', () => {})
    return
  }

  // Regression test for a segment cache keying bug.
  //
  // During the Shell prefetch phase the client walks at the StaticShell
  // strategy, and it used to key whatever came back at `tree.shellVaryPath`,
  // which replaces every non-root param with Fallback. That's only correct
  // when the payload really is the param-independent shell.
  //
  // When a route renders with no dynamic hole, the response has no shell/full
  // split — the "shell" payload IS the concrete render for the params that
  // were requested. Keying it at the wildcard path published one param's page
  // as the answer for every other param value, and recorded it at the highest
  // tier, so later navigations rendered the wrong page and skipped the network
  // entirely.
  //
  // On an optional catch-all, the index (empty slug) is the case that hits
  // this: prefetching /docs poisoned /docs/alpha and /docs/beta.
  //
  // The fix makes the server-reported vary params authoritative, so the shell
  // path is used exactly when the segment really is param-independent.
  it('does not serve the catch-all index page for a different slug', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Prefetch the fully static index of the optional catch-all route. Its
    // response has no shell/full split, so this is the write that used to land
    // in the param-wildcard slot.
    await act(
      async () => {
        await browser.elementByCss('input[data-link-accordion="/docs"]').click()
      },
      { includes: 'Docs: index' }
    )

    // Navigate there. Fully prefetched, so nothing should be requested.
    await act(async () => {
      await browser.elementByCss('a[href="/docs"]').click()
      expect(await browser.elementById('docs-page-index').text()).toBe(
        'Docs: index'
      )
    }, 'no-requests')

    // Now prefetch a different slug on the same route. Before the fix the
    // index's page segment was sitting in the wildcard slot marked complete,
    // so this fired no request at all for the page content and this
    // expectation would time out.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/docs/alpha"]')
          .click()
      },
      { includes: 'Docs: alpha' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/docs/alpha"]').click()
      expect(await browser.elementById('docs-page-alpha').text()).toBe(
        'Docs: alpha'
      )
    }, 'no-requests')
  })
})
