import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('optimistic routing - parallel slot catch-all regression', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Optimistic routing is a production-build feature; in dev mode the
    // router does not have complete information about which routes
    // exist, so prediction is disabled.
    test('skipped in dev mode', () => {})
    return
  }

  // Regression test: a route with a parallel slot whose route is a
  // required catch-all (e.g., /[teamSlug] with an
  // `@actions/[...catchAll]` slot) used to poison route prediction.
  // After visiting /myteam, navigating to a longer sibling URL like
  // /myteam/myproject would reuse a prediction derived from the
  // @actions slot's catch-all, resolving the URL to the team-page
  // content even though /myteam/myproject is a separate route. The
  // router skipped the server fetch entirely under the (incorrect)
  // assumption that the URL was already known.
  //
  // Detection: visit /myteam (which would teach the bad prediction).
  // Then click /myteam/myproject and wait for a response containing
  // "PROJECT PAGE". With the bug, no server fetch happens, so "PROJECT
  // PAGE" never arrives and the `act` waiter rejects. With the fix, no
  // prediction matches /myteam/myproject and a real server fetch
  // delivers the project page.
  it('does not match a parallel-slot catch-all for an unrelated sibling URL', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Reveal + click /myteam (a /[teamSlug] route). Its layout
    // includes an `@actions/[...catchAll]` parallel slot. Visiting
    // /myteam would, under the bug, teach the router a prediction
    // that wrongly matches longer sibling URLs.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/myteam"]'
        )
        await toggle.click()
        const link = await browser.elementByCss('a[href="/myteam"]')
        await link.click()
      },
      { includes: 'TEAM OVERVIEW' }
    )
    expect(await browser.elementByCss('h1').text()).toBe('TEAM OVERVIEW')

    // Reveal + click /myteam/myproject — a sibling URL whose data is
    // not already cached. Without the fix, the router uses the
    // incorrect prediction taught by the previous step and skips the
    // server fetch; "PROJECT PAGE" never arrives and `act` rejects.
    // With the fix, no prediction matches /myteam/myproject and a
    // real server fetch delivers the project page.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/myteam/myproject"]'
        )
        await toggle.click()
        const link = await browser.elementByCss('a[href="/myteam/myproject"]')
        await link.click()
      },
      { includes: 'PROJECT PAGE' }
    )
    expect(await browser.elementByCss('h1').text()).toBe('PROJECT PAGE')
  })
})
