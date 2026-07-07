import { nextTestSetup, type Playwright } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('optimistic routing - rewrite detection regression', () => {
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

  // The shape of every test below is the same:
  //
  // 1. Reveal a "prefetch" link whose URL arrives via a rewrite. The
  //    response describes a route shape the URL would not naturally
  //    route to. The router must not learn from this response as a
  //    prediction template — otherwise future navigations to other
  //    URLs of the same dynamic shape would receive an incorrect
  //    "free" prediction and could render a stale loading state
  //    instantly.
  // 2. Reveal one of the click-target links (prefetch={false}).
  // 3. Click it inside an act scope. With the bug, the router uses the
  //    rewrite-affected response as a prediction and the cached
  //    /[teamSlug] loading boundary appears synchronously. With the
  //    fix, no prediction is available and the loading boundary only
  //    appears once the server responds.

  async function setupBrowser() {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })
    return { browser, act: act! }
  }

  async function revealPrefetch(
    browser: Playwright,
    act: ReturnType<typeof createRouterAct>,
    href: string
  ) {
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          `input[data-link-accordion="${href}"]`
        )
        await toggle.click()
      },
      // Wait for the prefetch to complete by matching the loading
      // boundary text in the response.
      { includes: 'Loading team' }
    )
  }

  async function revealAndClick(
    browser: Playwright,
    act: ReturnType<typeof createRouterAct>,
    href: string
  ) {
    await act(async () => {
      const toggle = await browser.elementByCss(
        `input[data-link-accordion="${href}"]`
      )
      await toggle.click()
    }, 'no-requests')

    const link = await browser.elementByCss(`a[href="${href}"]`)
    await act(async () => {
      await link.click()
      const teamLoading = await browser
        .elementById('team-loading')
        .catch(() => null)
      expect(teamLoading).toBeNull()
    })
  }

  it('does not predict from a rewrite that shortens the URL', async () => {
    // The rewrite /myteam/garbage → /myteam produces a response whose
    // route shape is one part shorter than the canonical URL.
    const { browser, act } = await setupBrowser()
    await revealPrefetch(browser, act, '/myteam/garbage')
    await revealAndClick(browser, act, '/yourteam')
    expect(
      await (await browser.elementById('team-page')).getAttribute('data-slug')
    ).toBe('yourteam')
  })

  it('does not predict from a rewrite to a static-sibling URL', async () => {
    // The rewrite /featured → /some-team produces a response that
    // resolves through /[teamSlug] for a URL that, under normal
    // routing, would have matched the static /featured page (a known
    // sibling of /[teamSlug]).
    const { browser, act } = await setupBrowser()
    await revealPrefetch(browser, act, '/featured')
    await revealAndClick(browser, act, '/yourteam')
    expect(
      await (await browser.elementById('team-page')).getAttribute('data-slug')
    ).toBe('yourteam')
  })

  it('does not predict when the rewrite hides a deeper static segment', async () => {
    // The rewrite /team-shorter → /team-shorter/overview produces a
    // response whose deeper visible-static segment (`overview`) has no
    // URL part to match against under the canonical URL `/team-shorter`.
    const { browser, act } = await setupBrowser()
    await revealPrefetch(browser, act, '/team-shorter')
    await revealAndClick(browser, act, '/yourteam')
    expect(
      await (await browser.elementById('team-page')).getAttribute('data-slug')
    ).toBe('yourteam')
  })

  // Note: a fourth case where the deeper segment is a regular dynamic
  // (e.g. /team-dyn → /team-dyn/proj-1, response for /[teamSlug]/[project])
  // does not have a regression test here. The pattern would land at the
  // [project] trie node, which is only reachable via a 2-part click URL,
  // and the cached page shell at that depth is rendered for the click
  // regardless of whether the prediction was stored — so the loading
  // boundary visible / not visible signal does not distinguish with-fix
  // from without-fix at the UI level. The bailout for this case is still
  // covered defensively by the same `paramType !== 'oc' && urlPart === null`
  // check as case 2.
})
