import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from '../../../../lib/next-test-utils'

const REPRODUCE_UNNECESSARY_RUNTIME_PREFETCH =
  !!process.env.REPRODUCE_UNNECESSARY_RUNTIME_PREFETCH || false

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

// @force-gate prefetching
describe('static App Shell prefetch attempt', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

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

  it('uses a runtime shell when the page reads cookies', async () => {
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

  it('uses a static app shell when the page reads searchParams', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /uses-search-params?q=test.
    // Accessing runtime data means that a runtime prefetch would provide more data,
    // but this should not affect the shell, which doesn't have access to searchParams.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-prefetch="auto"][data-link-accordion="/uses-search-params?q=test"]'
        )
        .click()
    }, [
      // The shell is static
      { includes: 'Search params page shell text', kind: 'static' },
      // No runtime requests should occur.
      {
        includes: '',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // When navigating, we should show the shell, without search params.
    await act(async () => {
      await browser.elementByCss('a[href="/uses-search-params?q=test"]').click()
      expect(await browser.elementById('page-content').text()).toBe(
        `Search params page shell text`
      )
      expect(await browser.elementById('search-loading').text()).toBe(
        'Loading query...'
      )
    }, [
      {
        includes: 'Query: test',
      },
    ])

    // Search params arrive in the navigation response.
    expect(await browser.elementById('search-content').text()).toBe(
      `Query: test`
    )
  })

  it('speculative: uses a runtime prefetch when the page reads searchParams', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /uses-search-params?q=test.
    // Accessing runtime data means that a runtime prefetch would provide more data,
    // so that's what we should use.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-prefetch="true"][data-link-accordion="/uses-search-params?q=test"]'
        )
        .click()
    }, [
      // The shell is static
      { includes: 'Search params page shell text', kind: 'static' },
      // The prefetch is runtime
      {
        includes: 'Query: test',
        kind: 'runtime',
      },
    ])

    // When navigating, we should show the runtime prefetch.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/uses-search-params?q=test"]')
          .click()

        expect(await browser.elementById('search-content').text()).toBe(
          `Query: test`
        )
      },
      // The runtime prefetch is complete.
      'no-requests'
    )

    expect(await browser.elementById('search-content').text()).toBe(
      `Query: test`
    )
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

  it('uses a static app shell for a partial segment that awaits fallback params after navigation()', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal a prefetch-auto link to /params-used-after-navigation/1.
    // Runtime data was only awaited after navigation(), so a static app shell is sufficient
    // (a runtime app shell would not provide more data, because it does not include navigation())
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-prefetch="auto"][data-link-accordion="/params-used-after-navigation/1"]'
        )
        .click()
    }, [
      // We only expect a static prefetch, no runtime requests.
      { includes: 'Params awaited after navigation', kind: 'static' },
      // The param is not static, so it should not be part of the prefetch.
      {
        includes: 'Post: 1',
        block: 'reject',
      },
      {
        includes: '',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // Navigate to an unprefetched link with a different param value.
    // This should re-use the prefetch that we got from '1'.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/params-used-after-navigation/2"]')
          .click()

        expect(await browser.elementById('page-content').text()).toBe(
          'Params awaited after navigation'
        )

        // `navigation()` *does* resolve in static prefetches, so we have navigation-gated
        // content. The static prefetch does not vary on params (because the param
        // is a fallback), so we're using it instead of the shell, and navigation content
        // is visible.
        expect(await browser.elementById('navigation-content').text()).toBe(
          'Navigation content'
        )
        expect(await browser.elementById('param-loading').text()).toBe(
          'Loading param content...'
        )
      },
      // The param-dependent content streams in with the navigation response.
      { includes: 'Post: 2' }
    )

    expect(await browser.elementById('navigation-content').text()).toBe(
      'Navigation content'
    )
    expect(await browser.elementById('param-value').text()).toBe('Post: 2')
  })

  it('speculative: uses a static prefetch for a partial segment that awaits fallback params after navigation()', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal a prefetch-true link to /params-used-after-navigation/1.
    // Runtime data was only awaited after navigation(), so a static prefetch is sufficient
    // (a runtime prefetch would not provide more data, because it does not include navigation())
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-prefetch="true"][data-link-accordion="/params-used-after-navigation/1"]'
        )
        .click()
    }, [
      // We only expect a static prefetch, no runtime requests.
      { includes: 'Params awaited after navigation', kind: 'static' },
      // The param is not static, so it should not be part of the prefetch.
      {
        includes: 'Post: 1',
        block: 'reject',
      },
      {
        includes: '',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // Navigate to the prefetched link.
    // We should show the prefetch while navigating.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/params-used-after-navigation/1"]')
          .click()

        expect(await browser.elementById('page-content').text()).toBe(
          'Params awaited after navigation'
        )

        // `navigation()` *does* resolve in static prefetches, so we have navigation-gated
        // content. The static prefetch does not vary on params (because the param
        // is a fallback), so we're using it instead of the shell, and navigation content
        // is visible.
        expect(await browser.elementById('navigation-content').text()).toBe(
          'Navigation content'
        )
        expect(await browser.elementById('param-loading').text()).toBe(
          'Loading param content...'
        )
      },
      // The param-dependent content streams in with the navigation response.
      { includes: 'Post: 1' }
    )

    expect(await browser.elementById('param-value').text()).toBe('Post: 1')
  })

  const getPathnameFromHref = (href: string) =>
    new URL(href, 'http://__n').pathname

  it('uses a static shell for a partial segment that has a param-dependent icon.tsx', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal a prefetch-auto link to /params-used-in-icon/1.
    // No runtime data was awaited in the page itself during the prerender.
    // The head is param-dependent because it needs to link to the
    // param-dependent icon:
    //
    //   <link rel="icon" href="/params-used-in-icon/1/icon">
    //
    // but this should not affect the shell, which cannot access params anyway.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-prefetch="auto"][data-link-accordion="/params-used-in-icon/1"]'
        )
        .click()
    }, [
      // The shell is static.
      {
        includes: 'Params awaited in icon.tsx and after dynamic data',
        kind: 'static',
      },
      // No runtime requests should occur.
      {
        includes: '',
        kind: 'runtime',
        block: 'reject',
      },
      { includes: 'Dynamic content', block: 'reject' },
    ])

    // Navigate to an unprefetched link with a different param value.
    // We should show the app shell that we got when we prefetched /1.
    await act(
      async () => {
        await browser.elementByCss('a[href="/params-used-in-icon/2"]').click()

        expect(await browser.elementById('page-content').text()).toBe(
          'Params awaited in icon.tsx and after dynamic data'
        )

        // The icon is param-dependent and should not be part of the shell.
        expect(await browser.locator('link[rel="icon"]').count()).toBe(0)

        // No dynamic content yet.
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
      getPathnameFromHref(
        await browser.elementByCss('link[rel="icon"]').getAttribute('href')
      )
    ).toEqual('/params-used-in-icon/2/icon')

    expect(await browser.elementById('param-value').text()).toBe('Post: 2')
  })

  it('speculative: uses a runtime prefetch for a partial segment that has a param-dependent icon.tsx', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal a prefetch-true link for /params-used-in-icon/1.
    // No runtime data was awaited in the page itself during the prerender.
    // The head is param-dependent because it needs to link to the
    // param-dependent icon:
    //
    //   <link rel="icon" href="/params-used-in-icon/1/icon">
    //
    // This affects the prefetch, which should be runtime.

    const iconLinkPathname = '/params-used-in-icon/1/icon'

    await act(async () => {
      await browser
        .elementByCss(
          'input[data-prefetch="true"][data-link-accordion="/params-used-in-icon/1"]'
        )
        .click()
    }, [
      // The shell is static.
      {
        includes: 'Params awaited in icon.tsx and after dynamic data',
        kind: 'static',
      },
      // The prefetch is runtime.
      {
        includes: iconLinkPathname,
        kind: 'runtime',
      },
      { includes: 'Dynamic content', block: 'reject' },
    ])

    // We should show the prefetch while navigating.
    await act(
      async () => {
        await browser.elementByCss('a[href="/params-used-in-icon/1"]').click()

        expect(await browser.elementById('page-content').text()).toBe(
          'Params awaited in icon.tsx and after dynamic data'
        )

        // TODO: for some reason, the prefetched icon is not shown while navigating
        // expect(
        //   getPathnameFromHref(
        //     await browser.elementByCss('link[rel="icon"]').getAttribute('href')
        //   )
        // ).toEqual(iconLinkPathname)

        // No dynamic content yet.
        expect(await browser.elementById('dynamic-loading').text()).toBe(
          'Loading dynamic content...'
        )
      },
      // The dynamic content streams in with the navigation response.
      { includes: 'Dynamic content' }
    )

    expect(
      getPathnameFromHref(
        await browser.elementByCss('link[rel="icon"]').getAttribute('href')
      )
    ).toEqual(iconLinkPathname)

    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )
    expect(await browser.elementById('param-value').text()).toBe('Post: 1')
  })

  it('uses a static shell for a partial segment whose holes are dynamic (connection)', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal a prefetch-auto link to /uses-connection. `connection()` is
    // dynamic data (it hangs during runtime prerenders too), so it's not
    // recorded as a runtime-data access -- the page segment is partial, but
    // it's sufficient — a runtime shell would have the same hole.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-prefetch="auto"][data-link-accordion="/uses-connection"]'
        )
        .click()
    }, [
      { includes: 'Connection page shell text', kind: 'static' },
      // No runtime requests or dynamic content.
      {
        includes: '',
        kind: 'runtime',
        block: 'reject',
      },
      { includes: 'Connection content', block: 'reject' },
    ])

    // We should show the shell while navigating.
    await act(
      async () => {
        await browser.elementByCss('a[href="/uses-connection"]').click()

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

  it('speculative: uses a static prefetch for a partial segment whose holes are dynamic (connection)', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal a prefetch-true link to /uses-connection. `connection()` is
    // dynamic data (it hangs during runtime prerenders too), so it's not
    // recorded as a runtime-data access -- the page segment is partial, but
    // it's sufficient — a runtime shell would have the same hole.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-prefetch="auto"][data-link-accordion="/uses-connection"]'
        )
        .click()
    }, [
      { includes: 'Connection page shell text', kind: 'static' },
      // No runtime requests or dynamic content.
      {
        includes: '',
        kind: 'runtime',
        block: 'reject',
      },
      { includes: 'Connection content', block: 'reject' },
    ])

    // We should show the prefetch while navigating.
    await act(
      async () => {
        await browser.elementByCss('a[href="/uses-connection"]').click()

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

  it('uses a static shell for a partial segment that calls runtime APIs after navigation()', async () => {
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

  it('uses a static app shell for a partial segment that calls runtime APIs after prefetch()', async () => {
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
          'input[data-prefetch="auto"][data-link-accordion="/uses-runtime-after-prefetch"]'
        )
        .click()
    }, [
      // Gating runtime data accesses after prefetch() means that the shell is static
      // even if the prefetch is not.
      { includes: 'Runtime APIs called after prefetch()', kind: 'static' },
      // No runtime request should happen.
      {
        includes: '',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // We should show the shell while navigating.
    await act(async () => {
      await browser
        .elementByCss('a[href="/uses-runtime-after-prefetch"]')
        .click()

      expect(await browser.elementById('page-content').text()).toBe(
        'Runtime APIs called after prefetch()'
      )
      // The static prefetch includes both the shell and static prefetch data.
      expect(await browser.elementById('prefetch-content').text()).toBe(
        'Prefetch content'
      )
      // Runtime data is not included.
      expect(await browser.elementById('runtime-loading').text()).toBe(
        'Loading runtime content...'
      )
    }, [{ includes: 'Runtime content' }])
  })

  it('speculative: uses a runtime prefetch for a partial segment that calls runtime APIs after prefetch()', async () => {
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
          'input[data-prefetch="true"][data-link-accordion="/uses-runtime-after-prefetch"]'
        )
        .click()
    }, [
      // Gating runtime data accesses after prefetch() means that the shell is static
      // even if the prefetch is not.
      { includes: 'Runtime APIs called after prefetch()', kind: 'static' },
      // No runtime request should happen.
      {
        includes: 'Runtime content',
        kind: 'runtime',
      },
    ])

    // We should show the runtime prefetch while navigating.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/uses-runtime-after-prefetch"]')
          .click()

        expect(await browser.elementById('runtime-content').text()).toBe(
          'Runtime content'
        )
      },
      // The runtime prefetch is complete.
      'no-requests'
    )
  })

  describe('excluded caches', () => {
    it("uses a static shell when the page accesses a cache that's excluded from shells due to a short staletime", async () => {
      // Caches with `stale < MIN_SHELL_STALE` are excluded from shells.
      // They should not cause a page to use a runtime shell.

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
            'input[data-link-accordion="/excluded-caches/uses-non-shell-cache"]'
          )
          .click()
      }, [
        // The static request still includes the cache, because it's included
        // in the static prerender.
        {
          includes: 'Cache value',
          kind: 'static',
        },
      ])
    })

    it("uses a static shell when the page accesses a cache that's not prefetchable due to a short staletime", async () => {
      // Caches with `stale < MIN_PREFETCHABLE_STALE` are excluded from all prerenders.
      // They should not cause a page to use a runtime shell.

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
            'input[data-link-accordion="/excluded-caches/uses-non-prefetchable-cache"]'
          )
          .click()
      }, [
        // We should use a static request.
        {
          includes: 'Uses a cache that is excluded from all prerenders',
          kind: 'static',
        },
        // The static prerender should not include the cache.
        {
          includes: 'Cache value',
          block: 'reject',
        },
      ])
    })

    it("uses a runtime shell when the page accesses a cache that's excluded from static prerenders due to short expire", async () => {
      // Caches with `expire < MIN_PRERENDERABLE_EXPIRE` are excluded from
      // static prerenders, but included in runtime prerenders. If a page
      // uses one, it should use a runtime shell and access the cache.

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
            'input[data-link-accordion="/excluded-caches/uses-non-prerenderable-cache"]'
          )
          .click()
      }, [
        // We should use a runtime shell, and the cache should be included.
        {
          includes: 'Cache value',
          kind: 'runtime',
        },
      ])
    })
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

  it('speculative: prefetch={true} prefetches a fully static page using static requests', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the prefetch={true} LinkAccordion for /speculative-static.
    // The route is fully static, so prefetching the shell with a static request is enough.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/speculative-static"]')
        .click()
    }, [
      // The page content arrives in a static per-segment response...
      { includes: 'Speculative-static page content', kind: 'static' },
      // ...and must NOT arrive in a runtime prefetch response.
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

  it('speculative: uses a runtime shell shell and a runtime prefetch when the page reads cookies', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the prefetch={true} LinkAccordion for /speculative-cookies.
    // The page reads cookies, so both the shell and the prefetch should use a
    // runtime request.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/speculative-cookies"]')
        .click()
    }, [
      // 1. Runtime shell (includes cookies)
      { includes: 'Speculative-cookies cookie: none', kind: 'runtime' },
      // 2. Runtime prefetch (includes cookies and search params)
      { includes: 'Search params count: 0', kind: 'runtime' },
      // No static requests.
      {
        includes: 'Speculative-cookies page shell text',
        kind: 'static',
        block: 'reject',
      },
    ])
  })

  it('speculative: attempts static prefetch for each param value', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // The page does not use runtime data, so it should only use
    // static requests for prefetching.

    // Reveal a prefetch-true link to param value 'one'.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/speculative-static-param/one"]'
        )
        .click()
    }, [
      // Static prefetch
      { includes: 'Slug: one', kind: 'static' },

      // No runtime requests
      {
        includes: '',
        kind: 'runtime',
        block: 'reject',
      },
    ])

    // Reveal a prefetch-true link to param value 'two'.
    // We have a runtime-tier shell from the first request, but we still
    // need to do a prefetch.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/speculative-static-param/two"]'
        )
        .click()
    }, [
      // Static prefetch
      { includes: 'Slug: two', kind: 'static' },

      // No runtime requests
      {
        includes: '',
        kind: 'runtime',
        block: 'reject',
      },
    ])
  })

  describe('when the staticness of the prefetch varies based on a param', () => {
    // The page used cookies in the prefetch for some param values
    // (the ones that don't include 'no-cookies'), but the static hint is still set --
    // it indicates that static prefetches *may* be worthwile, not that they always are.
    // This means we should always attempt a static prefetch first, but fall back to a
    // runtime prefetch if necessary for a certain slug value.

    /**
     * These tests have multiple links with the same href but different prefetch kinds.
     * This wrapper is used to make sure the test explicitly states which prefetch kind
     * it intends to trigger.
     * */
    const linkAccordionSelector = ({
      prefetch,
      href,
    }: {
      prefetch: 'auto' | true
      href: string
    }) => `input[data-prefetch="${prefetch}"][data-link-accordion="${href}"]`

    // NOTE: the case where:
    // - we already have a shell from param Y, but no static prefetch for param X yet
    // - we have a prefetch={true} link for param X, so we need a prefetch, but should attempt a static one first
    // is distinct from when we already start out by revealing a link to param X,
    // (which will give us both the shell and the prefetch in one static response)
    // so we test them separately.

    describe('when a link to a prerendered param where the static prefetch hint is set is revealed first', () => {
      describe('when a link to a prerendered param that does not use cookies in the prefetch is revealed second', () => {
        it('speculative: attempts a static prefetch and does not fall back to a runtime prefetch', async () => {
          let page: Playwright.Page
          const browser = await next.browser('/', {
            beforePageLoad(p: Playwright.Page) {
              page = p
            },
          })
          const act = createRouterAct(page, { includeAppShellRequests: true })

          // Reveal a prefetch-true link to 'no-cookies-in-prefetch', which did not use cookies.
          // The route tree is currently specific to the prerender it was extracted from, so it'll tell us
          // that static prefetches for this route are worthwile.
          await act(async () => {
            await browser
              .elementByCss(
                linkAccordionSelector({
                  href: '/maybe-runtime-prefetch/no-cookies-in-prefetch',
                  prefetch: true,
                })
              )
              .click()
          }, [
            // Initial static prefetch (due to build-time static hint)
            { includes: 'Slug: no-cookies-in-prefetch', kind: 'static' },

            // No runtime requests.
            {
              includes: '',
              kind: 'runtime',
              block: 'reject',
            },
          ])
          // We now have a sufficient shell.

          // Reveal a prefetch-true link to param value 'no-cookies-in-prefetch-2',
          // which did not use cookies in the prefetch either.
          // Based on hints from the first route, we think static prefetches are worthwile.
          await act(async () => {
            await browser
              .elementByCss(
                linkAccordionSelector({
                  href: '/maybe-runtime-prefetch/no-cookies-in-prefetch-2',
                  prefetch: true,
                })
              )
              .click()
          }, [
            // Static prefetch attempt (due to build-time static hint)
            { includes: 'Slug: no-cookies-in-prefetch-2', kind: 'static' },

            // No runtime requests.
            {
              includes: '',
              kind: 'runtime',
              block: 'reject',
            },
          ])

          // When we navigate, we should show the static prefetch content.
          await act(async () => {
            await browser
              .elementByCss(
                'a[href="/maybe-runtime-prefetch/no-cookies-in-prefetch-2"]'
              )
              .click()

            expect(await browser.elementById('param-content').text()).toBe(
              'Slug: no-cookies-in-prefetch-2'
            )
            expect(
              await browser.elementById('maybe-runtime-content').text()
            ).toBe('Runtime data accessed on no-cookies-in-prefetch-2: false')
          }, [{ includes: 'Dynamic content' }])

          expect(await browser.elementById('dynamic-content').text()).toBe(
            'Dynamic content'
          )
        })

        it('does not fall back to a runtime shell', async () => {
          let page: Playwright.Page
          const browser = await next.browser('/', {
            beforePageLoad(p: Playwright.Page) {
              page = p
            },
          })
          const act = createRouterAct(page, { includeAppShellRequests: true })

          // Reveal a prefetch-true link to 'no-cookies-in-prefetch', which did not use cookies
          // in the prefetch.
          // The route tree is currently specific to the prerender it was extracted from, so it'll tell us
          // that static prefetches for the whole route are worthwile.
          await act(async () => {
            await browser
              .elementByCss(
                linkAccordionSelector({
                  href: '/maybe-runtime-prefetch/no-cookies-in-prefetch',
                  prefetch: true,
                })
              )
              .click()
          }, [
            // Initial static prefetch (due to build-time static hint)
            { includes: 'Slug: no-cookies-in-prefetch', kind: 'static' },

            // No runtime requests.
            {
              includes: '',
              kind: 'runtime',
              block: 'reject',
            },
          ])
          // We now have a sufficient shell.

          // Reveal a prefetch-auto link to param value 'no-cookies-in-prefetch-2',
          // which used cookies in the prefetch, but did NOT use them in the shell.
          // This is not a speculative link, so we only need a shell, and we already have
          // a sufficient shell from the first link.
          await act(async () => {
            await browser
              .elementByCss(
                linkAccordionSelector({
                  href: '/maybe-runtime-prefetch/no-cookies-in-prefetch-2',
                  prefetch: 'auto',
                })
              )
              .click()
          }, 'no-requests')

          // When we navigate, we should show the shell.
          await act(async () => {
            await browser
              .elementByCss(
                'a[href="/maybe-runtime-prefetch/no-cookies-in-prefetch-2"]'
              )
              .click()

            expect(await browser.elementById('param-loading').text()).toBe(
              'Loading param content...'
            )
            // We didn't fetch the any param-dependent data for this link.
            expect(await browser.locator('#param-content').count()).toBe(0)
            expect(
              await browser.locator('#maybe-runtime-content-fallback').count()
            ).toBe(0)
          }, [{ includes: 'Dynamic content' }])

          expect(await browser.elementById('dynamic-content').text()).toBe(
            'Dynamic content'
          )
        })
      })

      describe('when a link to a prerendered param that uses cookies in the prefetch is revealed', () => {
        it('speculative: attempts a static prefetch, then falls back to a runtime prefetch', async () => {
          let page: Playwright.Page
          const browser = await next.browser('/', {
            beforePageLoad(p: Playwright.Page) {
              page = p
            },
          })
          const act = createRouterAct(page, { includeAppShellRequests: true })

          // Reveal a prefetch-true link to 'no-cookies-in-prefetch', which did not use cookies.
          // The route tree is currently specific to the prerender it was extracted from, so it'll tell us
          // that static prefetches for this route are worthwile.
          await act(async () => {
            await browser
              .elementByCss(
                linkAccordionSelector({
                  href: '/maybe-runtime-prefetch/no-cookies-in-prefetch',
                  prefetch: true,
                })
              )
              .click()
          }, [
            // Initial static prefetch (due to build-time static hint)
            { includes: 'Slug: no-cookies-in-prefetch', kind: 'static' },

            // No runtime requests.
            {
              includes: '',
              kind: 'runtime',
              block: 'reject',
            },
          ])
          // We now have a sufficient shell.

          // Reveal a prefetch-true link to param value 'yes-cookies-in-prefetch',
          // which DID use cookies in the prefetch (but did not use them in the shell)
          // Based on hints from the first route, we think static prefetches are worthwile.
          await act(async () => {
            await browser
              .elementByCss(
                linkAccordionSelector({
                  href: '/maybe-runtime-prefetch/yes-cookies-in-prefetch',
                  prefetch: true,
                })
              )
              .click()
          }, [
            // Static prefetch attempt (due to build-time static hint)
            { includes: 'Slug: yes-cookies-in-prefetch', kind: 'static' },

            // Runtime prefetch follow-up, because the response indicates
            // that the prefetch needs a runtime request
            {
              includes:
                'Runtime data accessed on yes-cookies-in-prefetch: true',
              kind: 'runtime',
            },
          ])

          // When we navigate, we should show the runtime prefetch content.
          await act(async () => {
            await browser
              .elementByCss(
                'a[href="/maybe-runtime-prefetch/yes-cookies-in-prefetch"]'
              )
              .click()

            expect(await browser.elementById('param-content').text()).toBe(
              'Slug: yes-cookies-in-prefetch'
            )
            expect(
              await browser.elementById('maybe-runtime-content').text()
            ).toBe('Runtime data accessed on yes-cookies-in-prefetch: true')
          }, [{ includes: 'Dynamic content' }])

          expect(
            await browser.elementById('maybe-runtime-content').text()
          ).toBe('Runtime data accessed on yes-cookies-in-prefetch: true')
        })

        it('does not fall back to a runtime shell if only the prefetch used cookies', async () => {
          let page: Playwright.Page
          const browser = await next.browser('/', {
            beforePageLoad(p: Playwright.Page) {
              page = p
            },
          })
          const act = createRouterAct(page, { includeAppShellRequests: true })

          // Reveal a prefetch-true link to 'no-cookies-in-prefetch', which did not use cookies
          // in the prefetch.
          // The route tree is currently specific to the prerender it was extracted from, so it'll tell us
          // that static prefetches for the whole route are worthwile.
          await act(async () => {
            await browser
              .elementByCss(
                linkAccordionSelector({
                  href: '/maybe-runtime-prefetch/no-cookies-in-prefetch',
                  prefetch: true,
                })
              )
              .click()
          }, [
            // Initial static prefetch (due to build-time static hint)
            { includes: 'Slug: no-cookies-in-prefetch', kind: 'static' },

            // No runtime requests.
            {
              includes: '',
              kind: 'runtime',
              block: 'reject',
            },
          ])
          // We now have a sufficient shell.

          // Reveal a prefetch-auto link to param value 'yes-cookies-in-prefetch',
          // which used cookies in the prefetch, but did NOT use them in the shell.
          // This is not a speculative link, so we only need a shell, and we already have
          // a sufficient shell from the first link.
          await act(async () => {
            await browser
              .elementByCss(
                linkAccordionSelector({
                  href: '/maybe-runtime-prefetch/yes-cookies-in-prefetch',
                  prefetch: 'auto',
                })
              )
              .click()
          }, 'no-requests')

          // When we navigate, we should show the shell.
          await act(async () => {
            await browser
              .elementByCss(
                'a[href="/maybe-runtime-prefetch/yes-cookies-in-prefetch"]'
              )
              .click()

            expect(await browser.elementById('param-loading').text()).toBe(
              'Loading param content...'
            )
            // We didn't fetch the any param-dependent data for this link.
            expect(await browser.locator('#param-content').count()).toBe(0)
            expect(
              await browser.locator('#maybe-runtime-content-fallback').count()
            ).toBe(0)
          }, [{ includes: 'Dynamic content' }])

          // The missing runtime data should arrive in the navigation response.
          expect(
            await browser.elementById('maybe-runtime-content').text()
          ).toBe('Runtime data accessed on yes-cookies-in-prefetch: true')
        })
      })
    })

    describe('when a link to a prerendered param where the static hint is not set is revealed first', () => {
      describe('when only a link to a prerendered param that uses cookies in the prefetch is revealed', () => {
        it('immediately uses a runtime prefetch for params that use cookies in the prefetch', async () => {
          let page: Playwright.Page
          const browser = await next.browser('/', {
            beforePageLoad(p: Playwright.Page) {
              page = p
            },
          })
          const act = createRouterAct(page, { includeAppShellRequests: true })

          // Reveal a prefetch-true link to 'no-cookies-in-prefetch', which did not use cookies.
          // The route tree is currently specific to the prerender it was extracted from, so it'll tell us
          // that static prefetches for this route are NOT worthwile.
          await act(async () => {
            await act(async () => {
              await browser
                .elementByCss(
                  linkAccordionSelector({
                    href: '/maybe-runtime-prefetch/yes-cookies-in-prefetch',
                    prefetch: true,
                  })
                )
                .click()
            }, [
              // The shell is static on this route, so we attempt a static
              // request first. It should give us a sufficient shell, but not a
              // sufficient prefetch.
              {
                includes: 'Slug: yes-cookies-in-prefetch',
                kind: 'static',
                block: true,
              },
              // No runtime requests at first
              { includes: '', kind: 'runtime', block: 'reject' },
            ])
          }, [
            // After the static request for the shell, we'll also do a runtime prefetch,
            // as directed by the hint.
            {
              includes:
                'Runtime data accessed on yes-cookies-in-prefetch: true',
              kind: 'runtime',
            },
          ])

          // When we navigate, we should show the runtime prefetch content.
          await act(async () => {
            await browser
              .elementByCss(
                'a[href="/maybe-runtime-prefetch/yes-cookies-in-prefetch"]'
              )
              .click()

            expect(await browser.elementById('param-content').text()).toBe(
              'Slug: yes-cookies-in-prefetch'
            )
            expect(
              await browser.elementById('maybe-runtime-content').text()
            ).toBe('Runtime data accessed on yes-cookies-in-prefetch: true')
          }, [{ includes: 'Dynamic content' }])

          expect(
            await browser.elementById('maybe-runtime-content').text()
          ).toBe('Runtime data accessed on yes-cookies-in-prefetch: true')
        })

        it('does not fall back to a runtime shell if only the prefetch used cookies', async () => {
          let page: Playwright.Page
          const browser = await next.browser('/', {
            beforePageLoad(p: Playwright.Page) {
              page = p
            },
          })
          const act = createRouterAct(page, { includeAppShellRequests: true })

          // Reveal a prefetch-auto link to 'yes-cookies-in-prefetch', which DID use cookies
          // in the prefetch (but not in the shell).
          // The route tree is currently specific to the prerender it was extracted from, so it'll tell us
          // that static prefetches for this route are NOT worthwile.
          await act(
            async () => {
              // Expected behavior
              await act(async () => {
                await browser
                  .elementByCss(
                    linkAccordionSelector({
                      href: '/maybe-runtime-prefetch/yes-cookies-in-prefetch',
                      prefetch: 'auto',
                    })
                  )
                  .click()
              }, [
                // We should fetch the shell using a static request, because
                // the shell doesn't use runtime data.
                {
                  includes: 'Slug: yes-cookies-in-prefetch',
                  kind: 'static',
                  block: true,
                },
                {
                  includes: '',
                  kind: 'runtime',
                  block: 'reject',
                },
              ])
            },
            // We should not do any more requests, because we have a sufficient shell.
            'no-requests'
          )

          // When we navigate, we should show the shell.
          await act(async () => {
            await browser
              .elementByCss(
                'a[href="/maybe-runtime-prefetch/yes-cookies-in-prefetch"]'
              )
              .click()

            // We did a static prefetch for this link, so we should have param-dependent
            // data, but not runtime data.
            expect(await browser.elementById('param-content').text()).toBe(
              'Slug: yes-cookies-in-prefetch'
            )
            expect(
              await browser.elementById('maybe-runtime-content-fallback').text()
            ).toBe('Loading runtime data...')
          }, [{ includes: 'Dynamic content' }])

          // The missing runtime content should arrive in the navigation response.
          expect(
            await browser.elementById('maybe-runtime-content').text()
          ).toBe('Runtime data accessed on yes-cookies-in-prefetch: true')

          expect(await browser.elementById('dynamic-content').text()).toBe(
            'Dynamic content'
          )
        })
      })
      describe('when a link to a prerendered param that does not use cookies in the prefetch is revealed second', () => {
        // FIXME: Flaky test
        // @force-gate !deploy
        it('[FAILING] speculative: attempts a static prefetch and does not fall back to a runtime prefetch', async () => {
          let page: Playwright.Page
          const browser = await next.browser('/', {
            beforePageLoad(p: Playwright.Page) {
              page = p
            },
          })
          const act = createRouterAct(page, { includeAppShellRequests: true })

          // Reveal a prefetch-auto link to 'yes-cookies-in-prefetch', which DID use cookies
          // in the prefetch (but not in the shell).
          // The route tree is currently specific to the prerender it was extracted from, so it'll tell us
          // that static prefetches for this route are NOT worthwile.
          await act(
            async () => {
              // Expected behavior
              await act(async () => {
                await browser
                  .elementByCss(
                    linkAccordionSelector({
                      href: '/maybe-runtime-prefetch/yes-cookies-in-prefetch',
                      prefetch: 'auto',
                    })
                  )
                  .click()
              }, [
                // We should fetch the shell using a static request, because
                // the shell doesn't use runtime data.
                {
                  includes: 'Slug: yes-cookies-in-prefetch',
                  kind: 'static',
                  block: true,
                },
                {
                  includes: '',
                  kind: 'runtime',
                  block: 'reject',
                },
              ])
            },
            // We should not do any more requests, because we have a sufficient shell.
            'no-requests'
          )

          // Reveal a prefetch-true link to 'no-cookies-in-prefetch', which did not use cookies
          // in the prefetch.
          if (REPRODUCE_UNNECESSARY_RUNTIME_PREFETCH) {
            // Expected behavior
            await act(async () => {
              await browser
                .elementByCss(
                  linkAccordionSelector({
                    href: '/maybe-runtime-prefetch/no-cookies-in-prefetch',
                    prefetch: true,
                  })
                )
                .click()
            }, [
              // We should attempt a static prefetch first, because the first route's
              // lack of static prefetch hint only indicates that it's not worth attempting
              // a static prefetch for THAT param value, not all param values.
              {
                includes: 'Slug: no-cookies-in-prefetch',
                kind: 'static',
              },
              // This param does not use cookies in the prefetch, so we should not
              // follow-up with a runtime prefetch.
              {
                includes: '',
                kind: 'runtime',
                block: 'reject',
              },
            ])
          } else {
            // Actual behavior
            await act(async () => {
              await browser
                .elementByCss(
                  linkAccordionSelector({
                    href: '/maybe-runtime-prefetch/no-cookies-in-prefetch',
                    prefetch: true,
                  })
                )
                .click()
            }, [
              // FAILING: The static prefetch hint is not set on the first route we fetched,
              // so we won't attempt a static prefetch for this one either even though we should.
              {
                includes: 'Slug: no-cookies-in-prefetch',
                kind: 'runtime',
              },
              {
                includes: 'Slug: no-cookies-in-prefetch',
                kind: 'static',
                block: 'reject',
              },
            ])
          }

          // When we navigate, we should show the prefetch.
          await act(async () => {
            await browser
              .elementByCss(
                'a[href="/maybe-runtime-prefetch/no-cookies-in-prefetch"]'
              )
              .click()

            expect(await browser.elementById('param-content').text()).toBe(
              'Slug: no-cookies-in-prefetch'
            )
            expect(
              await browser.elementById('maybe-runtime-content').text()
            ).toBe('Runtime data accessed on no-cookies-in-prefetch: false')
          }, [{ includes: 'Dynamic content' }])

          expect(await browser.elementById('dynamic-content').text()).toBe(
            'Dynamic content'
          )
        })

        it('does not fall back to a runtime shell if only the prefetch used cookies', async () => {
          let page: Playwright.Page
          const browser = await next.browser('/', {
            beforePageLoad(p: Playwright.Page) {
              page = p
            },
          })
          const act = createRouterAct(page, {
            includeAppShellRequests: true,
          })

          // Reveal a prefetch-auto link to 'yes-cookies-in-prefetch', which DID use cookies
          // in the prefetch.
          // The route tree is currently specific to the prerender it was extracted from, so it'll tell us
          // that static prefetches for this route are NOT worthwile.
          await act(
            async () => {
              // Expected behavior
              await act(async () => {
                await browser
                  .elementByCss(
                    linkAccordionSelector({
                      href: '/maybe-runtime-prefetch/yes-cookies-in-prefetch',
                      prefetch: 'auto',
                    })
                  )
                  .click()
              }, [
                // We should fetch the shell using a static request, because
                // the shell doesn't use runtime data.
                {
                  includes: 'Slug: yes-cookies-in-prefetch',
                  kind: 'static',
                  block: true,
                },
                {
                  includes: '',
                  kind: 'runtime',
                  block: 'reject',
                },
              ])
            },
            // We should not do any more requests, because we have a sufficient shell.
            'no-requests'
          )

          // Reveal a prefetch-auto link to 'no-cookies-in-prefetch', which did not use cookies
          // in the prefetch.
          await act(
            async () => {
              await browser
                .elementByCss(
                  linkAccordionSelector({
                    href: '/maybe-runtime-prefetch/no-cookies-in-prefetch',
                    prefetch: 'auto',
                  })
                )
                .click()
            },
            // We only need a shell, which was fetched when we revealed the first link.
            'no-requests'
          )

          // When we navigate, we should show the shell.
          await act(async () => {
            await browser
              .elementByCss(
                'a[href="/maybe-runtime-prefetch/no-cookies-in-prefetch"]'
              )
              .click()

            expect(await browser.elementById('param-loading').text()).toBe(
              'Loading param content...'
            )
            // We didn't fetch the any param-dependent data for this link.
            expect(await browser.locator('#param-content').count()).toBe(0)
            expect(
              await browser.locator('#maybe-runtime-content-fallback').count()
            ).toBe(0)
          }, [{ includes: 'Dynamic content' }])

          // The missing param-dependent content should arrive in the navigation response.
          expect(
            await browser.elementById('maybe-runtime-content').text()
          ).toBe('Runtime data accessed on no-cookies-in-prefetch: false')

          expect(await browser.elementById('dynamic-content').text()).toBe(
            'Dynamic content'
          )
        })
      })
    })

    // The legacy Vercel builder does not implement the Cache Components shell
    // eligibility and upgrade behavior asserted here.
    // @force-gate !deploy || adapter
    describe('when a link to a non-prerendered param is revealed first', () => {
      beforeAll(async () => {
        // Trigger an ISR prerender for the new param value.
        await next.fetch(
          '/maybe-runtime-prefetch/yes-cookies-in-prefetch-not-prerendered'
        )

        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // Wait until the client router gets the result of the ISR prerender instead of the fallback.
        let attemptCount = 0
        await retry(
          async () => {
            // Force a new prefetch by refreshing --
            // the client's ISR retry loop is hard to assert on with `act()`.
            if (attemptCount > 0) {
              await browser.refresh()
            }

            try {
              await act(async () => {
                await browser
                  .elementByCss(
                    linkAccordionSelector({
                      href: '/maybe-runtime-prefetch/yes-cookies-in-prefetch-not-prerendered',
                      prefetch: 'auto',
                    })
                  )
                  .click()
              }, [
                {
                  includes: 'Slug: yes-cookies-in-prefetch-not-prerendered',
                  kind: 'static',
                },
              ])
            } finally {
              attemptCount++
            }
          },
          10_000,
          1_000,
          'wait for ISR prerender to finish'
        )
      })

      it('attempts a static prefetch before falling back to a runtime prefetch', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // Reveal a prefetch-true link to 'yes-cookies-in-prefetch-not-prerendered',
        // which did uses cookies in the prefetch, but was not prerendered at build.
        // ISR prerenders use the shared build-time hints for the route, which say that
        // static prefetches may be worthwile.
        await act(async () => {
          await act(async () => {
            await browser
              .elementByCss(
                linkAccordionSelector({
                  href: '/maybe-runtime-prefetch/yes-cookies-in-prefetch-not-prerendered',
                  prefetch: true,
                })
              )
              .click()
          }, [
            // Due to the route-level static hint, we start out with a static prefetch.
            {
              includes: 'Slug: yes-cookies-in-prefetch-not-prerendered',
              kind: 'static',
              block: true,
            },
            {
              includes: '',
              kind: 'runtime',
              block: 'reject',
            },
          ])
        }, [
          // We should follow up with a runtime prefetch, because the static prefetch
          // turned out to be insufficient.
          {
            includes:
              'Runtime data accessed on yes-cookies-in-prefetch-not-prerendered: true',
            kind: 'runtime',
          },
        ])

        // When we navigate, we should show the runtime prefetch content.
        await act(async () => {
          await browser
            .elementByCss(
              'a[href="/maybe-runtime-prefetch/yes-cookies-in-prefetch-not-prerendered"]'
            )
            .click()

          expect(await browser.elementById('param-content').text()).toBe(
            'Slug: yes-cookies-in-prefetch-not-prerendered'
          )
          expect(
            await browser.elementById('maybe-runtime-content').text()
          ).toBe(
            'Runtime data accessed on yes-cookies-in-prefetch-not-prerendered: true'
          )
        }, [{ includes: 'Dynamic content' }])

        expect(await browser.elementById('maybe-runtime-content').text()).toBe(
          'Runtime data accessed on yes-cookies-in-prefetch-not-prerendered: true'
        )
      })

      it('does not fall back to a runtime shell if only the prefetch used cookies', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // Reveal a prefetch-auto link to 'no-cookies-in-prefetch', which did not use cookies
        // in the prefetch.
        // The route tree is currently specific to the prerender it was extracted from, so it'll tell us
        // that static prefetches for this route are NOT worthwile.
        await act(
          async () => {
            await act(async () => {
              await browser
                .elementByCss(
                  linkAccordionSelector({
                    href: '/maybe-runtime-prefetch/yes-cookies-in-prefetch-not-prerendered',
                    prefetch: 'auto',
                  })
                )
                .click()
            }, [
              // Due to the route-level static hint, we start out with a static prefetch.
              {
                includes: 'Slug: yes-cookies-in-prefetch-not-prerendered',
                kind: 'static',
                block: true,
              },
              {
                includes: '',
                kind: 'runtime',
                block: 'reject',
              },
            ])
          },
          // We should not do any more requests, because we have a sufficient shell.
          'no-requests'
        )

        // When we navigate, we should show the static prefetch.
        await act(async () => {
          await browser
            .elementByCss(
              'a[href="/maybe-runtime-prefetch/yes-cookies-in-prefetch-not-prerendered"]'
            )
            .click()

          // We have param-dependent content, but not runtime data.
          expect(await browser.elementById('param-content').text()).toBe(
            'Slug: yes-cookies-in-prefetch-not-prerendered'
          )
          expect(
            await browser.elementById('maybe-runtime-content-fallback').text()
          ).toBe('Loading runtime data...')
        }, [{ includes: 'Dynamic content' }])

        // The missing runtime data should arrive in the navigation response.
        expect(await browser.elementById('maybe-runtime-content').text()).toBe(
          'Runtime data accessed on yes-cookies-in-prefetch-not-prerendered: true'
        )
      })
    })
  })

  describe('unstable_ensureStatic', () => {
    describe('unstable_ensureStatic = false', () => {
      it('uses a runtime shell for a page that uses cookies', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // Reveal the link to the page.
        // The page has `unstable_ensureStatic = false`, and uses cookies (with no other dynamic holes).
        // It should use a runtime shell.
        await act(async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/ensure-static/false/uses-cookies"]'
            )
            .click()
        }, [
          // Cookies are included in the runtime shell.
          { includes: 'cookie-content', kind: 'runtime' },
          // No static request.
          {
            includes: 'Cookies page shell text',
            kind: 'static',
            block: 'reject',
          },
        ])

        // The shell is complete, so navigating should not require any extra requests.
        await act(
          () =>
            browser
              .elementByCss('a[href="/ensure-static/false/uses-cookies"]')
              .click(),
          'no-requests'
        )
      })
    })

    describe('unstable_ensureStatic = "shell"', () => {
      it('uses a static shell for a page that uses cookies`', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // Reveal a prefetch-auto link to the page.
        // The page has `unstable_ensureStatic = "shell"`, and uses cookies.
        // It should use a static prefetch.
        await act(async () => {
          await browser
            .elementByCss(
              'input[data-prefetch="auto"][data-link-accordion="/ensure-static/shell/uses-cookies"]'
            )
            .click()
        }, [
          // Static prefetch (for the shell)
          {
            includes: 'Cookies page shell text',
            kind: 'static',
          },
          // No runtime requests
          {
            includes: 'Cookies page shell text',
            kind: 'runtime',
            block: 'reject',
          },
        ])

        // The shell has a dynamic hole from `cookies()`, so navigating should spawn an
        // extra request to fill it in.
        await act(
          () =>
            browser
              .elementByCss('a[href="/ensure-static/shell/uses-cookies"]')
              .click(),
          [{ includes: 'cookie-content' }]
        )
      })

      it('uses a static shell and a runtime prefetch for a `prefetch={true}` link to a page that uses cookies`', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // Reveal a prefetch-true link to the page.
        // The page has `unstable_ensureStatic = "shell"`, and uses cookies.
        // It should use a static prefetch, and a runtime shell.
        await act(async () => {
          await browser
            .elementByCss(
              'input[data-prefetch="true"][data-link-accordion="/ensure-static/shell/uses-cookies"]'
            )
            .click()
        }, [
          // Static prefetch (for the shell)
          {
            includes: 'Cookies page shell text',
            kind: 'static',
          },
          // Runtime prefetch
          {
            includes: 'cookie-content',
            kind: 'runtime',
          },
        ])

        // The shell was partial, but the prefetch is complete, so we should not need any requests to navigate.
        await act(
          () =>
            browser
              .elementByCss('a[href="/ensure-static/shell/uses-cookies"]')
              .click(),
          'no-requests'
        )
      })
    })

    describe('unstable_ensureStatic = "prefetch"', () => {
      it('uses a static request for a link to a page that uses cookies', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // Reveal a prefetch-auto link to the page.
        // The page has `unstable_ensureStatic = "prefetch"`, and uses cookies (with no other dynamic holes).
        // It should use a static prefetch.
        await act(async () => {
          await browser
            .elementByCss(
              'input[data-prefetch="auto"][data-link-accordion="/ensure-static/prefetch/uses-cookies"]'
            )
            .click()
        }, [
          // Static prefetch
          {
            includes: 'Cookies page shell text',
            kind: 'static',
          },
          // No runtime requests.
          { includes: 'cookie-content', kind: 'runtime', block: 'reject' },
        ])

        // The prefetch has a dynamic hole from `cookies()`, so navigating should spawn an
        // extra request to fill it in.
        await act(
          () =>
            browser
              .elementByCss('a[href="/ensure-static/prefetch/uses-cookies"]')
              .click(),
          [{ includes: 'cookie-content' }]
        )
      })

      it('uses a static request for a `prefetch={true}` link to a page that uses cookies', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // Reveal a prefetch-true link to the page.
        // The page has `unstable_ensureStatic = "prefetch"`, and uses cookies (with no other dynamic holes).
        // It should use a static prefetch.
        await act(async () => {
          await browser
            .elementByCss(
              'input[data-prefetch="true"][data-link-accordion="/ensure-static/prefetch/uses-cookies"]'
            )
            .click()
        }, [
          // Static prefetch
          {
            includes: 'Cookies page shell text',
            kind: 'static',
          },
          // No runtime requests.
          { includes: 'cookie-content', kind: 'runtime', block: 'reject' },
        ])

        // The prefetch has a dynamic hole from `cookies()`, so navigating should spawn an
        // extra request to fill it in.
        await act(
          () =>
            browser
              .elementByCss('a[href="/ensure-static/prefetch/uses-cookies"]')
              .click(),
          [{ includes: 'cookie-content' }]
        )
      })
    })
  })
})
