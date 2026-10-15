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
  // On an optional catch-all, the index (empty slug) is the case that hit
  // this: prefetching /docs poisoned /docs/alpha and /docs/beta, so later
  // navigations rendered the index page and skipped the network entirely.
  //
  // The fix keys entries by the vary params the server reports, so we only
  // use the shell path when the segment really doesn't depend on the params.
  // The server also keeps the index's absent slug out of the shell, like any
  // other param, so the shared shell has no slug-dependent content.
  it('does not serve the catch-all index page for a different slug', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Prefetch the fully static index of the optional catch-all route. This is
    // the payload that used to be stored at the shell vary path.
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

    // Now prefetch a different slug on the same route. The shared shell is
    // already cached, and a shell link only needs the shell, so nothing is
    // requested.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/docs/alpha"]')
        .click()
    }, 'no-requests')

    // The navigation fetches alpha's page. Before the fix, the index's page
    // segment was stored at the shell vary path and marked complete, so this
    // rendered the index page without a request.
    await act(
      async () => {
        await browser.elementByCss('a[href="/docs/alpha"]').click()
      },
      { includes: 'Docs: alpha' }
    )
    expect(await browser.elementById('docs-page-alpha').text()).toBe(
      'Docs: alpha'
    )
  })
})
