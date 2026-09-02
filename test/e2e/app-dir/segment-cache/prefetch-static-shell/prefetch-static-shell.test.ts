import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// This suite tests the static App Shell prefetch attempt.
//
// When a route's tree prefetch response carries the static-prefetch hint —
// set iff the render that produced the tree accessed NO runtime data
// (cookies, headers, searchParams, fallback params) — the client's Shell
// prefetch phase attempts STATIC per-segment prefetches of the App Shell
// instead of the runtime shell request it would otherwise issue. Each static
// response signals whether a runtime request would return more than it did,
// and when the responses arrive the scheduler checks that signal for each
// shell segment:
//
// - If every shell segment is sufficient, the Shell phase completes with no
//   runtime request. A segment can be sufficient even when it's partial, as
//   long as its holes are *dynamic* (only fillable by the navigation-time
//   dynamic request, e.g. `connection()`), not *runtime* (fillable by a
//   runtime prefetch, e.g. cookies).
// - If any shell segment is insufficient, the existing single batched
//   runtime shell prefetch fires as a fallback. The attempt is serial,
//   never raced: static attempt → observe → runtime only if needed.
//
// If the hint is unset, the client goes straight to the runtime shell
// request (previous behavior).
//
// All of the above concerns the NEW part of the target tree — the segments
// that differ from the current page. Segments shared with the current page
// are outside the shell-attempt machinery entirely: the shared part of the
// tree always performs the ordinary static per-segment prefetch, in every
// phase, regardless of the hint — mirroring how runtime requests also cover
// only the new part. In this suite the shared part is always just the root
// layout (every link is prefetched from the home page), and its cache entry
// is already populated from the initial page load's seed data, so the shared
// walk is a cache hit and no request fires for it. What the tests can pin is
// the other half of the model: runtime requests never cover the shared part
// (see the layout rejection in the cookies test).
//
// The hint reflects the WHOLE render that produced the tree: any runtime-
// data access unsets it, no matter how late in the render the access
// happened. The per-segment signal is finer-grained: the shell variant of a
// segment response covers only what rendered during the shell stage, so an
// access recorded after that stage leaves the shell variant clean ("no
// runtime request needed for the shell") even though the full response
// records it.
//
// This suite asserts directly on App Shell prefetch responses, so every
// `createRouterAct` call passes `{ includeAppShellRequests: true }` — by
// default router-act excludes runtime shell requests from assertions.
// Expectations additionally use `kind: 'static' | 'runtime'` to assert HOW a
// piece of content arrived: 'static' matches per-segment static prefetch
// requests (including the route tree prefetch), 'runtime' matches dynamic
// prefetch requests (e.g. the runtime shell request).
describe('static App Shell prefetch attempt', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    // The feature depends on build-time prerenders and ISR regeneration
    // semantics that don't exist in dev.
    it('is skipped', () => {})
    return
  }

  it('prefetches a fully static route with static requests only, then navigates instantly from cache', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /fully-static. The route accesses no
    // runtime data, so its tree carries the static-prefetch hint and the
    // Shell phase attempts static per-segment prefetches. The static
    // responses are complete, so no runtime shell request fires.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/fully-static"]')
        .click()
    }, [
      // The shell content arrives in a static per-segment response...
      { includes: 'Fully static page content', kind: 'static' },
      // ...and must NOT arrive in a runtime prefetch response — the
      // static attempt was sufficient, so no runtime request fires.
      {
        includes: 'Fully static page content',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // Navigate to the prefetched route. Everything was cached by the static
    // prefetch, so the navigation completes without any requests.
    await act(async () => {
      await browser.elementByCss('a[href="/fully-static"]').click()
      expect(await browser.elementById('page-content').text()).toBe(
        'Fully static page content'
      )
    }, 'no-requests')
  })

  it('prefetches a fully static route that uses navigation() with static requests only, then navigates instantly from cache', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /uses-navigation-static. The route accesses no
    // runtime data, so its tree carries the static-prefetch hint and the
    // Shell phase attempts static per-segment prefetches. The static
    // responses are complete, so no runtime shell request fires.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/uses-navigation-static"]')
        .click()
    }, [
      // The shell content arrives in a static per-segment response...
      {
        includes: 'Fully static page content (with navigation())',
        kind: 'static',
      },
      // ...and must NOT arrive in a runtime prefetch response — the
      // static attempt was sufficient, so no runtime request fires.
      {
        includes: 'Fully static page content (with navigation())',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // Navigate to the prefetched route. Everything was cached by the static
    // prefetch, so the navigation completes without any requests.
    await act(async () => {
      await browser.elementByCss('a[href="/uses-navigation-static"]').click()
      expect(await browser.elementById('page-content').text()).toBe(
        'Fully static page content (with navigation())'
      )
    }, 'no-requests')
  })

  it('prefetches a fully static route that uses prefetch() with static requests only, then navigates instantly from cache', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // prefetch() resolves during a static prerender, and the route accesses no
    // runtime data, so the static attempt is sufficient.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/uses-prefetch-static"]')
        .click()
    }, [
      {
        includes: 'Fully static page content (with prefetch())',
        kind: 'static',
      },
      {
        includes: 'Fully static page content (with prefetch())',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    await act(async () => {
      await browser.elementByCss('a[href="/uses-prefetch-static"]').click()
      expect(await browser.elementById('page-content').text()).toBe(
        'Fully static page content (with prefetch())'
      )
    }, 'no-requests')
  })

  it('goes straight to a runtime shell prefetch when the shell reads cookies (hint unset)', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /uses-cookies. The page reads cookies in
    // the shell stage of every prerender, so the tree hint is unset and the
    // Shell phase issues the runtime shell request for the new part of the
    // tree directly, with no static shell attempt preceding it. (The shared
    // part — the root layout — is outside the hint's scope: it always gets
    // the ordinary static prefetch, which here is a cache hit against the
    // initial page load's seed data, so no request fires for it.)
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/uses-cookies"]')
        .click()
    }, [
      // Cookies are included in the runtime shell.
      { includes: 'cookie-content', kind: 'runtime' },
      // No static attempt for the new part: the page content must not
      // arrive in a static per-segment response. (The route tree prefetch
      // is also `kind: 'static'`, but its response doesn't contain rendered
      // page content, so it can't match this.)
      {
        includes: 'Cookies page shell text',
        kind: 'static',
        block: 'reject',
      },
      // The runtime shell request covers only the new part of the tree:
      // the shared root layout's content must never arrive in a
      // runtime response.
      {
        includes: 'Root layout static text',
        kind: 'runtime',
        block: 'reject',
      },
    ])
  })

  it('goes straight to a runtime shell prefetch when the shell reads searchParams (hint unset)', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /uses-search-params?q=test. Observing
    // searchParams is a runtime-data access (search params hang during a
    // static prerender but resolve during a runtime one), so like the
    // cookies route the tree hint is unset and the Shell phase issues the
    // runtime shell request directly.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/uses-search-params?q=test"]')
        .click()
    }, [
      // The shell content arrives in the runtime shell response. (The
      // query-dependent content is URL data, which is never part of an
      // App Shell, so we only assert on the shell text.)
      { includes: 'Search params page shell text', kind: 'runtime' },
      // No static attempt for the new part preceded it.
      {
        includes: 'Search params page shell text',
        kind: 'static',
        block: 'reject',
      },
    ])
  })

  it("uses a static app shell for a partial segment that calls runtime APIs but doesn't await them", async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /runtime-called-but-not-awaited.
    // No runtime data was awaited, so a static app shell is sufficient
    // (a runtime app shell would not provide more data)
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/runtime-called-but-not-awaited"]'
        )
        .click()
    }, [
      { includes: 'Runtime APIs called but not awaited', kind: 'static' },
      // We only expect a static prefetch.
      {
        includes: 'Runtime APIs called but not awaited',
        kind: 'runtime',
        block: 'reject',
      },
      { includes: 'Dynamic content', kind: 'runtime', block: 'reject' },
    ])

    // Navigate. The prefetched shell renders instantly, and the dynamic data arrives
    // later, as part of the navigation request.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/runtime-called-but-not-awaited"]')
          .click()

        // While the navigation response is blocked (we're still inside the
        // `act` scope), the prefetched shell is already visible, with the
        // loading fallback in place of the dynamic content.
        expect(await browser.elementById('page-content').text()).toBe(
          'Runtime APIs called but not awaited'
        )
        expect(await browser.elementById('dynamic-loading').text()).toBe(
          'Loading dynamic content...'
        )
      },
      // The dynamic content streams in with the navigation response.
      { includes: 'Dynamic content' }
    )

    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )
  })

  it('uses a static app shell for a partial segment that only awaits params after dynamic data', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /params-used-after-dynamic/1.
    // No runtime data was awaited, so a static app shell is sufficient
    // (a runtime app shell would not provide more data)
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/params-used-after-dynamic/1"]'
        )
        .click()
    }, [
      { includes: 'Params awaited after dynamic data', kind: 'static' },
      // We only expect a static prefetch, no runtime requests.
      {
        includes: 'Params awaited after dynamic data',
        kind: 'runtime',
        block: 'reject',
      },
      { includes: 'Dynamic content', kind: 'runtime', block: 'reject' },
    ])

    // Navigate to an unprefetched link with a different param value.
    // This should re-use the app shell that we got when we prefetched /1.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/params-used-after-dynamic/2"]')
          .click()

        // While the navigation response is blocked (we're still inside the
        // `act` scope), the prefetched shell is already visible, with the
        // loading fallback in place of the dynamic content.
        expect(await browser.elementById('page-content').text()).toBe(
          'Params awaited after dynamic data'
        )
        expect(await browser.elementById('dynamic-loading').text()).toBe(
          'Loading dynamic content...'
        )
      },
      // The dynamic content streams in with the navigation response.
      { includes: 'Dynamic content' }
    )

    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )
    expect(await browser.elementById('param-value').text()).toBe('Post: 2')
  })

  it('uses a static app shell for a partial segment that only awaits params after navigation()', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /params-used-after-navigation/1.
    // No runtime data was awaited, so a static app shell is sufficient
    // (a runtime app shell would not provide more data)
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/params-used-after-navigation/1"]'
        )
        .click()
    }, [
      { includes: 'Params awaited after navigation', kind: 'static' },
      // We only expect a static prefetch, no runtime requests.
      {
        includes: 'Params awaited after navigation',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // Navigate to an unprefetched link with a different param value.
    // This should re-use the app shell that we got when we prefetched /1.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/params-used-after-navigation/2"]')
          .click()

        expect(await browser.elementById('page-content').text()).toBe(
          'Params awaited after navigation'
        )

        // `navigation()` *does* resolve in static prefetches so we have navigation-gated
        // content for /1. However, it is not considered part of the app shell, so it should
        // not be visible here.
        expect(await browser.elementById('navigation-loading').text()).toBe(
          'Loading navigation content...'
        )
      },
      // The navigation content streams in with the navigation response.
      { includes: 'Navigation content' }
    )

    expect(await browser.elementById('navigation-content').text()).toBe(
      'Navigation content'
    )
    expect(await browser.elementById('param-value').text()).toBe('Post: 2')
  })

  it('uses a runtime shell for a partial segment that has a param-dependent icon.tsx', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /params-used-in-icon/1.
    // No runtime data was awaited in the page itself during the prerender,
    // but the head is param-dependent because it needs to link to the
    // param-dependent icon:
    //
    //   <link rel="icon" href="/params-only-in-icon/1/icon">
    //
    // which is tracked as a runtime data access and deopts the page
    // to runtime requests.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/params-used-in-icon/1"]')
        .click()
    }, [
      {
        includes: 'Params awaited in icon.tsx and after dynamic data',
        kind: 'runtime',
      },
      {
        includes: 'Params awaited in icon.tsx and after dynamic data',
        kind: 'static',
        block: 'reject',
      },
      { includes: 'Dynamic content', kind: 'static', block: 'reject' },
    ])

    // Navigate to an unprefetched link with a different param value.
    // This should re-use the app shell that we got when we prefetched /1.
    await act(
      async () => {
        await browser.elementByCss('a[href="/params-used-in-icon/2"]').click()

        // While the navigation response is blocked (we're still inside the
        // `act` scope), the prefetched shell is already visible, with the
        // loading fallback in place of the dynamic content.
        expect(await browser.elementById('page-content').text()).toBe(
          'Params awaited in icon.tsx and after dynamic data'
        )

        // The icon is param-dependent and should not be part of the shell.
        expect(await browser.locator('link[rel="icon"]').count()).toBe(0)

        expect(await browser.elementById('dynamic-loading').text()).toBe(
          'Loading dynamic content...'
        )
      },
      // The dynamic content streams in with the navigation response.
      { includes: 'Dynamic content' }
    )

    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )

    expect(
      new URL(
        await browser.elementByCss('link[rel="icon"]').getAttribute('href'),
        'http://__n'
      ).pathname
    ).toEqual('/params-used-in-icon/2/icon')

    expect(await browser.elementById('param-value').text()).toBe('Post: 2')
  })

  it('does not fall back to a runtime shell prefetch for a partial segment whose holes are dynamic (connection)', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /uses-connection. `connection()` is
    // dynamic data (it hangs during runtime prerenders too), so it's not
    // recorded as a runtime-data access: the tree hint is set, the static
    // attempt fires, and although the page segment is partial, it's
    // sufficient — a runtime prefetch would have the same hole. No runtime
    // fallback fires.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/uses-connection"]')
        .click()
    }, [
      { includes: 'Connection page shell text', kind: 'static' },
      // Neither the shell nor the dynamic content may arrive in a runtime
      // prefetch response — no runtime request should fire at all.
      {
        includes: 'Connection page shell text',
        kind: 'runtime',
        block: 'reject',
      },
      { includes: 'Connection content', kind: 'runtime', block: 'reject' },
    ])

    // Navigate. The prefetched shell renders instantly; the dynamic hole is
    // filled by the navigation-time dynamic request, as always.
    await act(
      async () => {
        await browser.elementByCss('a[href="/uses-connection"]').click()

        // While the navigation response is blocked (we're still inside the
        // `act` scope), the prefetched shell is already visible, with the
        // loading fallback in place of the dynamic content.
        expect(await browser.elementById('page-content').text()).toBe(
          'Connection page shell text'
        )
        expect(await browser.elementById('connection-loading').text()).toBe(
          'Loading connection content...'
        )
      },
      // The dynamic content streams in with the navigation response.
      { includes: 'Connection content' }
    )
    expect(await browser.elementById('connection-content').text()).toBe(
      'Connection content'
    )
  })

  it('does not fall back to a runtime shell prefetch for a partial segment that calls runtime APIs after navigation()', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/uses-runtime-after-navigation"]'
        )
        .click()
    }, [
      // In a static prerender, navigation() is allowed to resolve,
      // so content behind navigation() will be part of a static prefetch.
      { includes: 'Navigation content', kind: 'static' },
      // No runtime request should fire.
      {
        includes: 'Runtime APIs called after navigation()',
        kind: 'runtime',
        block: 'reject',
      },
      // Dynamic data should not be included.
      {
        includes: 'Dynamic content',
        block: 'reject',
      },
    ])

    // Navigate. The prefetched shell renders instantly; the dynamic hole is
    // filled by the navigation-time dynamic request, as always.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/uses-runtime-after-navigation"]')
          .click()

        // While the navigation response is blocked (we're still inside the
        // `act` scope), the prefetched shell is already visible, with the
        // loading fallback in place of the dynamic content.
        expect(await browser.elementById('page-content').text()).toBe(
          'Runtime APIs called after navigation()'
        )
        expect(await browser.elementById('navigation-content').text()).toBe(
          'Navigation content'
        )
        expect(await browser.elementById('dynamic-loading').text()).toBe(
          'Loading dynamic content...'
        )
      },
      // The dynamic content streams in with the navigation response.
      { includes: 'Dynamic content' }
    )
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )
  })

  it('goes straight to a runtime shell prefetch for a partial segment that calls runtime APIs after prefetch() (hint unset)', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/uses-runtime-after-prefetch"]'
        )
        .click()
    }, [
      // Unlike navigation(), prefetch() doesn't stop runtime-data tracking, so
      // the cookies()/headers() reads below it leave the tree hint unset and
      // the shell arrives in a runtime response.
      { includes: 'Runtime APIs called after prefetch()', kind: 'runtime' },
      // No static attempt precedes it.
      {
        includes: 'Runtime APIs called after prefetch()',
        kind: 'static',
        block: 'reject',
      },
    ])
  })

  it('reuses the static App Shell across different param values of a dynamic route', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /dynamic-param/one. Every URL of the
    // route is prerendered at build time and accesses no runtime data, so
    // the route tree prefetch carries the static-prefetch hint and the
    // Shell phase attempts static per-segment prefetches. The static
    // responses are sufficient, so no runtime request fires.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/dynamic-param/one"]')
        .click()
    }, [
      // The shell content arrives in a static per-segment response. The
      // response is the full prerender for this URL; the client extracts
      // the param-agnostic shell prefix and caches it at a key shared by
      // every param value of the route. (The response also carries this
      // URL's param content — a fully static prerender isn't truncated —
      // but that's incidental, so we don't assert on it.)
      { includes: 'Dynamic-param page shell text', kind: 'static' },
      // No runtime request fires — the static attempt was sufficient.
      {
        includes: 'Dynamic-param page shell text',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // Reveal the LinkAccordion for /dynamic-param/two — a different param
    // value of the same route. Everything this prefetch needs is already
    // cached: the App Shell entries cached by the previous prefetch are
    // param-agnostic, so they're cache hits for this URL too, and the
    // earlier route tree prefetch also taught the client the route's shape
    // and its statically-known param values, so even the target route is
    // constructed locally. And because the route is non-eager, the per-URL
    // content is left for the navigation-time dynamic request. So no request
    // of any kind fires — in particular, nothing re-fetches the shared
    // shell content.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/dynamic-param/two"]')
        .click()
    }, 'no-requests')

    // Navigate to /dynamic-param/two. The App Shell reused from the other
    // param's prefetch renders instantly, before the navigation response
    // arrives; the param content streams in with the navigation response.
    await act(
      async () => {
        await browser.elementByCss('a[href="/dynamic-param/two"]').click()

        // While the navigation response is blocked (we're still inside the
        // `act` scope), the reused shell is already visible, with the
        // loading fallback in place of the param content and content
        // behind navigation()
        expect(await browser.elementById('page-content').text()).toBe(
          'Dynamic-param page shell text'
        )
        expect(await browser.elementById('slug-loading').text()).toBe(
          'Loading param content...'
        )
        expect(await browser.elementById('navigation-loading').text()).toBe(
          'Loading navigation content...'
        )
        expect(await browser.elementById('prefetch-loading').text()).toBe(
          'Loading prefetch content...'
        )
      },
      // The param content arrives with the navigation response.
      { includes: 'Dynamic param content: two' }
    )
    expect(await browser.elementById('slug-content').text()).toBe(
      'Dynamic param content: two'
    )
  })

  // The two tests below exercise the SPECULATIVE half of the unified
  // model: Partial Prefetching segments require runtime-completeness in
  // every phase, and the Speculative phase only processes such a segment
  // when the link opts in (prefetch={true} — the speculative-* accordions on
  // the home page set it; non-eager routes are otherwise shell-only by
  // design). The same hint-gated attempt applies: hint set → the segment
  // joins the normal static prefetch walk and each response's sufficiency
  // signal decides whether the batched runtime fallback fires; hint unset →
  // straight to the runtime prefetch. This relies on the server emitting
  // static data for Partial Prefetching segments unconditionally.

  it('speculative: prefetch={true} with the hint set prefetches statically with no runtime request', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the prefetch={true} LinkAccordion for /speculative-static. The
    // route accesses no runtime data, so its tree carries the
    // static-prefetch hint; both the Shell phase and the Speculative phase
    // attempt static prefetches of the page segment, and the complete
    // static responses make any runtime request unnecessary.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/speculative-static"]')
        .click()
    }, [
      // The page content arrives in a static per-segment response...
      { includes: 'Speculative-static page content', kind: 'static' },
      // ...and must NOT arrive in a runtime prefetch response — the static
      // attempt was sufficient, so neither the runtime shell request nor
      // the Speculative phase's runtime prefetch fires, despite the
      // segment's runtime-completeness requirement.
      {
        includes: 'Speculative-static page content',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // Navigate to the prefetched route. Everything was cached by the static
    // prefetch, so the navigation completes without any requests.
    await act(async () => {
      await browser.elementByCss('a[href="/speculative-static"]').click()
      expect(await browser.elementById('page-content').text()).toBe(
        'Speculative-static page content'
      )
    }, 'no-requests')
  })

  it('speculative: goes straight to a runtime prefetch when the hint is unset', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the prefetch={true} LinkAccordion for /speculative-cookies. The
    // page reads cookies in the shell stage of every prerender, so the tree
    // hint is unset and the scheduler skips the static attempt entirely: the
    // page segment is runtime prefetched directly, in both the Shell and
    // Speculative phases.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/speculative-cookies"]')
        .click()
    }, [
      // 1. Runtime shell (includes cookies)
      { includes: 'Speculative-cookies cookie: none', kind: 'runtime' },
      // 2. Runtime prefetch (includes cookies and search params)
      { includes: 'Search params count: 0', kind: 'runtime' },

      // No static attempt in either phase: the page content must not
      // arrive in ANY static per-segment response. (The server does emit
      // static data for the segment — the shell text is in it — but with
      // the hint unset nothing fetches it.
      {
        includes: 'Speculative-cookies page shell text',
        kind: 'static',
        block: 'reject',
      },
    ])
  })
})
