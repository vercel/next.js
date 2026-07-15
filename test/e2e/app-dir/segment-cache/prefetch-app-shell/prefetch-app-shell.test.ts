import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// This suite asserts directly on App Shell prefetch responses, so every
// `createRouterAct` call passes `{ includeAppShellRequests: true }`. By default
// router-act ignores App Shell requests (those with `next-router-prefetch: '3'`)
// for assertion purposes, since the App Shell is conceptually part of the route
// rather than prefetch data. These tests are the exception that opts back in.
describe('App Shell prefetching', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('reuses the app shell across different param values so navigation to an unprefetched route is instant', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /posts/1. This caches the App Shell
    // for the route — the param-independent content of the page that's
    // reusable for any /posts/[id]. The link uses the default (auto)
    // prefetch, so under App Shells it prefetches only the shared shell;
    // the per-link Speculative prefetch is skipped.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/posts/1"]')
          .click()
      },
      { includes: 'App shell for posts' }
    )

    await act(async () => {
      // Click the link to /posts/124. This link is rendered with
      // prefetch={false}, so it was never prefetched. The cached App
      // Shell should render immediately, before any navigation response
      // arrives.
      await browser.elementByCss('a[href="/posts/124"]').click()

      // While the navigation response is blocked (we're still in the
      // `act` block), the cached App Shell should already be visible.
      expect(await browser.elementById('shell').text()).toEqual(
        'App shell for posts'
      )
      // Sesssion data (cookies) is not dependent on URL-data, so they are
      // allowed to be accessed in the shell.
      expect(await browser.elementById('cookie-value').text()).toEqual(
        'Cookie: none'
      )
    })

    // After the outer act unblocks the navigation, params resolve and the
    // dynamic content streams in.
    expect(await browser.elementById('param-value').text()).toEqual('Post 124')
    expect(await browser.elementById('dynamic-content').text()).toEqual(
      'Post body for 124'
    )
  })

  it('skips the per-link Speculative prefetch for a non-eager (allow-runtime) route', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal /posts/1 (default/auto prefetch). The route is allow-runtime, which
    // is NOT eager, so under App Shells only the shared App Shell is prefetched.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/posts/1"]')
          .click()
      },
      { includes: 'App shell for posts' }
    )

    // Reveal /posts/2 — a different param that shares the same App Shell. The
    // shell is already cached and the per-link Speculative prefetch is skipped,
    // so this fires NO requests at all. This is the clearest signal that the
    // Speculative phase was skipped: a subsequent link to the same route needs
    // nothing from the server.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/posts/2"]')
        .click()
    }, 'no-requests')
  })

  it('skips the per-link Speculative prefetch for a route with prefetch = "partial"', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal /partial/1. /partial/[id] is fully static and opts into Partial
    // Prefetching, so this prefetches the shared app shell ("Partial app
    // shell"). We assert on the shell text — not the page content. (A fully
    // static prerender can't be truncated, so this response also happens to
    // carry "Partial post 1", but that's incidental to how static prerenders
    // work, not part of the App Shells model, so we don't assert on it.)
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/partial/1"]')
          .click()
      },
      { includes: 'Partial app shell' }
    )

    // Reveal /partial/2 — a different param that shares the same app shell. The
    // shell is already cached and the per-link Speculative prefetch is skipped,
    // so this fires NO requests at all. This is the clearest signal that the
    // Speculative phase was skipped: a subsequent link to the same route needs
    // nothing from the server.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/partial/2"]')
        .click()
    }, 'no-requests')
  })

  it('does NOT skip the Speculative prefetch for a route with prefetch = "unstable_eager"', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal /eager/1. /eager/[id] opts into Partial Prefetching in "eager"
    // mode, so this primes the shared app shell. (Because the route is eager it
    // also speculatively prefetches param 1 here, but the assertion that
    // demonstrates the eager behavior is on the second link below, where the
    // shell is already cached and only the Speculative prefetch can fire.)
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/eager/1"]')
        .click()
    })

    // Reveal /eager/2 — a different param that shares the same app shell. The
    // shell is already cached, so it is NOT re-fetched. Because the route is
    // eager, the per-link Speculative prefetch fires for param 2 — a single
    // request carrying that param's content ("Eager post 2"). This is the
    // counterpart to the partial route's second link, which fired no requests:
    // an eager route keeps speculatively prefetching each new param.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/eager/2"]')
          .click()
      },
      { includes: 'Eager post 2' }
    )
  })

  it('treats a segment with both instant and prefetch = "unstable_eager" as eager', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // /eager-instant/[id] sets BOTH instant (which alone behaves like
    // 'partial' — not eager) and prefetch = 'unstable_eager'. The eager
    // opt-in wins, so the segment is treated as eager. Same two-link pattern as
    // the plain eager test: the first link primes the shared shell...
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/eager-instant/1"]')
        .click()
    })

    // ...and the second link (different param, shell already cached) fires the
    // per-link Speculative prefetch for param 2, proving the route is treated as
    // eager rather than skipping the Speculative phase.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/eager-instant/2"]')
          .click()
      },
      { includes: 'Eager-instant post 2' }
    )
  })

  it('does NOT skip the Speculative prefetch for a prefetch={true} link, even on a partial route', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal /partial/1 (default). /partial/[id] opts into Partial Prefetching,
    // so the default link primes the shared shell and skips the Speculative
    // prefetch (asserted by the other partial test). Here we just prime.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/partial/1"]')
        .click()
    })

    // Reveal /partial/3 — a different param, but this link is prefetch={true}
    // (a Full prefetch). prefetch={true} always prefetches the route's segments,
    // bypassing the App Shells skip. The shell is already cached, so the only
    // request is the Speculative prefetch for param 3, carrying its content
    // ("Partial post 3"). Contrast with the default partial link, whose second
    // link fires no requests: prefetch={true} opts back into per-link
    // prefetching even on a partial route.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/partial/3"]')
          .click()
      },
      { includes: 'Partial post 3' }
    )
  })

  it('extracts the App Shell from a fully-static prerender response', async () => {
    // The /static-posts/[id] route is fully static: all params are known via
    // `generateStaticParams` and the page accesses no other dynamic data, so
    // each URL is prerendered at build time. When the client prefetches one
    // URL, it receives the full prerender; the client extracts the shell
    // prefix (using the byte offset in the response) and caches it at the
    // Fallback vary path, so that navigations to OTHER URLs in the same
    // route still get an instant shell before the per-URL content arrives.
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /static-posts/1. Two prefetch responses
    // fire: one for the per-segment static prefetch of /static-posts/1
    // (which contains the resolved page content + the shell above the
    // params boundary), and one for the runtime shell prefetch (which the
    // server may return either as a truncated shell or as the full
    // prerender that the client extracts a shell prefix from). Both
    // responses contain the "App shell for static posts" substring.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/static-posts/1"]')
        .click()
    }, [
      { includes: 'App shell for static posts' },
      { includes: 'App shell for static posts' },
    ])

    // Click the link to /static-posts/124 — a different param than what
    // was prefetched, rendered with prefetch={false}. The cached App
    // Shell should render immediately, before the per-URL navigation
    // response arrives.
    await act(async () => {
      await browser.elementByCss('a[href="/static-posts/124"]').click()

      // While the navigation response is blocked (we're still in the
      // `act` block), the cached App Shell should already be visible.
      expect(await browser.elementById('static-shell').text()).toEqual(
        'App shell for static posts'
      )
    })

    // After the outer act unblocks the navigation, the per-URL content
    // streams in.
    expect(await browser.elementById('static-content').text()).toEqual(
      'Static post 124'
    )
  })

  it('excludes cached content with a short stale time from a runtime App Shell', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /short-stale/1. This caches the App Shell
    // for the route. The page renders two cached components: one with a stale
    // time of 5 minutes (the App Shell threshold), which is included in the
    // shell, and one with a stale time of 60 seconds, which is excluded from
    // the shell so the shell can be reused on the client for longer than the
    // content's stale time.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/short-stale/1"]')
          .click()
      },
      { includes: 'App shell for short-stale' }
    )

    await act(async () => {
      // Click the link to /short-stale/124. This link is rendered with
      // prefetch={false}, so it was never prefetched. The cached App Shell
      // should render immediately, before any navigation response arrives.
      await browser.elementByCss('a[href="/short-stale/124"]').click()

      // While the navigation response is blocked (we're still in the `act`
      // block), the cached App Shell should already be visible, including
      // the long-lived cached content.
      expect(await browser.elementById('shell').text()).toEqual(
        'App shell for short-stale'
      )
      expect(await browser.elementById('long-stale-content').text()).toEqual(
        'Long-lived cached content'
      )
      // The short-lived cached content is NOT part of the App Shell — only
      // its loading fallback is.
      expect(await browser.locator('#short-stale-content').count()).toBe(0)
      expect(await browser.elementById('short-stale-loading').text()).toEqual(
        'Loading short-lived content...'
      )
    })

    // After the outer act unblocks the navigation, the short-lived cached
    // content streams in with the navigation response, along with the
    // dynamic content.
    expect(await browser.elementById('short-stale-content').text()).toEqual(
      'Short-lived cached content'
    )
    expect(await browser.elementById('dynamic-content').text()).toEqual(
      'Post body for 124'
    )
  })

  it('excludes cached content with a short stale time from a static App Shell', async () => {
    // The /static-short-stale/[id] route is fully static and prerendered at
    // build time. The short-lived cached content is part of the static
    // prerender, but it resolves in the post-shell stage, so it's excluded
    // from the App Shell prefix that the client extracts from the prerender
    // response and reuses across URLs.
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal the LinkAccordion for /static-short-stale/1. Like the
    // static-posts route, two prefetch responses fire: the per-segment static
    // prefetch of /static-short-stale/1 and the runtime shell prefetch.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/static-short-stale/1"]')
        .click()
    }, [
      { includes: 'App shell for static short-stale posts' },
      { includes: 'App shell for static short-stale posts' },
    ])

    await act(async () => {
      // Click the link to /static-short-stale/124 — a different param than
      // what was prefetched, rendered with prefetch={false}. The cached App
      // Shell should render immediately, before the per-URL navigation
      // response arrives.
      await browser.elementByCss('a[href="/static-short-stale/124"]').click()

      // While the navigation response is blocked (we're still in the `act`
      // block), the cached App Shell should already be visible, including
      // the long-lived cached content.
      expect(await browser.elementById('static-shell').text()).toEqual(
        'App shell for static short-stale posts'
      )
      expect(
        await browser.elementById('static-long-stale-content').text()
      ).toEqual('Long-lived cached content')
      // The short-lived cached content is NOT part of the App Shell — only
      // its loading fallback is.
      expect(await browser.locator('#static-short-stale-content').count()).toBe(
        0
      )
      expect(
        await browser.elementById('static-short-stale-loading').text()
      ).toEqual('Loading short-lived content...')
    })

    // After the outer act unblocks the navigation, the short-lived cached
    // content streams in with the navigation response, along with the
    // per-URL content.
    expect(
      await browser.elementById('static-short-stale-content').text()
    ).toEqual('Short-lived cached content')
    expect(await browser.elementById('static-content').text()).toEqual(
      'Static post 124'
    )
  })

  describe('root params', () => {
    it('includes root params in a runtime App Shell', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/with-root-param/en', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Reveal the LinkAccordion for /with-root-param/en/posts/1. This caches the App Shell
      // for the route — the param-independent content of the page that's
      // reusable for any /with-root-param/en/posts/[id]. The link uses the default (auto)
      // prefetch, so under App Shells it prefetches only the shared shell;
      // the per-link Speculative prefetch is skipped.
      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/with-root-param/en/posts/1"]'
            )
            .click()
        },
        { includes: 'App shell for posts with root param: en' }
      )

      await act(async () => {
        // Click the link to /with-root-param/en/posts/124. This link is rendered with
        // prefetch={false}, so it was never prefetched. The cached App
        // Shell should render immediately, before any navigation response
        // arrives.
        await browser
          .elementByCss('a[href="/with-root-param/en/posts/124"]')
          .click()

        // While the navigation response is blocked (we're still in the
        // `act` block), the cached App Shell should already be visible.
        expect(await browser.elementById('shell').text()).toEqual(
          'App shell for posts with root param: en'
        )
        // Sesssion data (cookies) is not dependent on URL-data, so they are
        // allowed to be accessed in the shell.
        expect(await browser.elementById('cookie-value').text()).toEqual(
          'Cookie: none'
        )
      })

      // After the outer act unblocks the navigation, params resolve and the
      // dynamic content streams in.
      expect(await browser.elementById('param-value').text()).toEqual(
        'Post 124'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Post body for 124 with root param: en'
      )
    })

    it('includes root params in a static App Shell', async () => {
      // The /with-root-param/en/static-posts/[id] route is fully static: all params are known via
      // `generateStaticParams` and the page accesses no other dynamic data, so
      // each URL is prerendered at build time. When the client prefetches one
      // URL, it receives the full prerender; the client extracts the shell
      // prefix (using the byte offset in the response) and caches it at the
      // Fallback vary path, so that navigations to OTHER URLs in the same
      // route still get an instant shell before the per-URL content arrives.
      let page: Playwright.Page
      const browser = await next.browser('/with-root-param/en', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Reveal the LinkAccordion for /with-root-param/en/static-posts/1. Two prefetch responses
      // fire: one for the per-segment static prefetch of /with-root-param/en/static-posts/1
      // (which contains the resolved page content + the shell above the
      // params boundary), and one for the runtime shell prefetch (which the
      // server may return either as a truncated shell or as the full
      // prerender that the client extracts a shell prefix from). Both
      // responses contain the "App shell for static posts" substring.
      await act(async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/with-root-param/en/static-posts/1"]'
          )
          .click()
      }, [
        { includes: 'App shell for static posts with root param: en' },
        { includes: 'App shell for static posts with root param: en' },
      ])

      // Click the link to /with-root-param/en/static-posts/124 — a different param than what
      // was prefetched, rendered with prefetch={false}. The cached App
      // Shell should render immediately, before the per-URL navigation
      // response arrives.
      await act(async () => {
        await browser
          .elementByCss('a[href="/with-root-param/en/static-posts/124"]')
          .click()

        // While the navigation response is blocked (we're still in the
        // `act` block), the cached App Shell should already be visible.
        expect(await browser.elementById('static-shell').text()).toEqual(
          'App shell for static posts with root param: en'
        )
      })

      // After the outer act unblocks the navigation, the per-URL content
      // streams in.
      expect(await browser.elementById('static-content').text()).toEqual(
        'Static post 124 with root param: en'
      )
    })

    it('includes root params in a runtime App Shell when accessed via params object', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/with-root-param/en', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Reveal the LinkAccordion for
      // /with-root-param/en/root-param-via-params/with-session-data. This page
      // reads the root param via the `params` object (not next/root-params) and
      // reads request-time data (cookies), so its App Shell is a runtime shell.
      // The root param is available when the shell is prerendered, so it's
      // captured in the cached shell.
      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/with-root-param/en/root-param-via-params/with-session-data"]'
            )
            .click()
        },
        { includes: 'App shell for page with root param: en' }
      )

      await act(async () => {
        // Navigate by clicking the link we just revealed. Only the App Shell
        // was prefetched (not the per-URL content), and `act` blocks the
        // navigation response, so the cached App Shell — which captured the
        // root param — should render immediately, before the navigation
        // response arrives.
        await browser
          .elementByCss(
            'a[href="/with-root-param/en/root-param-via-params/with-session-data"]'
          )
          .click()

        // While the navigation response is blocked (we're still in the
        // `act` block), the cached App Shell should already be visible, with
        // the root param included.
        expect(await browser.elementById('shell').text()).toEqual(
          'App shell for page with root param: en'
        )
        // Sesssion data (cookies) is not dependent on URL-data, so they are
        // allowed to be accessed in the shell.
        expect(await browser.elementById('cookie-value').text()).toEqual(
          'Cookie: none'
        )
      })

      // After the outer act unblocks the navigation, the dynamic content
      // streams in.
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )
    })

    it('includes root params in an App Shell when accessed via params object', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/with-root-param/en', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Reveal the LinkAccordion for
      // /with-root-param/en/root-param-via-params/without-session-data. This
      // page reads the root param via the `params` object (not next/root-params)
      // and reads no request-time data in the shell, so its App Shell depends
      // only on the root param, which is captured in the cached shell.
      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/with-root-param/en/root-param-via-params/without-session-data"]'
            )
            .click()
        },
        { includes: 'App shell for page with root param: en' }
      )

      await act(async () => {
        // Navigate by clicking the link we just revealed. Only the App Shell
        // was prefetched (not the per-URL content), and `act` blocks the
        // navigation response, so the cached App Shell — which captured the
        // root param — should render immediately, before the navigation
        // response arrives.
        await browser
          .elementByCss(
            'a[href="/with-root-param/en/root-param-via-params/without-session-data"]'
          )
          .click()

        // While the navigation response is blocked (we're still in the
        // `act` block), the cached App Shell should already be visible, with
        // the root param included.
        expect(await browser.elementById('shell').text()).toEqual(
          'App shell for page with root param: en'
        )
      })

      // After the outer act unblocks the navigation, the dynamic content
      // streams in.
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Dynamic content'
      )
    })

    it('uses separate runtime App Shells for links with different root params', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/with-root-param/en', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Reveal the LinkAccordion for /with-root-param/en/posts/1. This caches the App Shell
      // for the route — the param-independent content of the page that's
      // reusable for any /with-root-param/en/posts/[id]. The link uses the default (auto)
      // prefetch, so under App Shells it prefetches only the shared shell;
      // the per-link Speculative prefetch is skipped.
      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/with-root-param/en/posts/1"]'
            )
            .click()
        },
        { includes: 'App shell for posts with root param: en' }
      )

      await act(async () => {
        const startingUrl = await browser.url()

        // Click the link to /with-root-param/pl/posts/126. This link is rendered with
        // prefetch={false}, so it was never prefetched.
        // It uses a different root param value ("pl", not "en"), so we shouldn't use
        // the App Shell we got from the link we revealed, and the navigation should block.
        await browser
          .elementByCss('a[href="/with-root-param/pl/posts/126"]')
          .click()

        // Wait for the router to actually start the navigation.
        // This will be observable by a pending indicator on the link.
        await browser.elementByCss(
          'a[href="/with-root-param/pl/posts/126"] [data-pending]'
        )

        // We're blocked, so the url should stay unchanged
        // and the cached App Shell should not be visible.
        expect(await browser.url()).toEqual(startingUrl)
        expect(await browser.locator('#shell').count()).toBe(0)
      })

      // After the outer act unblocks the navigation, params resolve and the
      // dynamic content streams in.
      expect(await browser.elementById('param-value').text()).toEqual(
        'Post 126'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Post body for 126 with root param: pl'
      )

      // Go back to the home page, then repeat the "prefetch post / navigate to
      // an unprefetched post that shares its shell" flow (from the "includes
      // root params" tests) with a THIRD root param ("fr"). This proves the
      // freshly prefetched "fr" shell is actually used — not the earlier "en"
      // shell.
      await browser.back()

      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/with-root-param/fr/posts/1"]'
            )
            .click()
        },
        { includes: 'App shell for posts with root param: fr' }
      )

      await act(async () => {
        // Navigate to an unprefetched post that shares the "fr" shell. The
        // cached "fr" shell (not "en") should render immediately, before the
        // navigation response arrives.
        await browser
          .elementByCss('a[href="/with-root-param/fr/posts/124"]')
          .click()

        expect(await browser.elementById('shell').text()).toEqual(
          'App shell for posts with root param: fr'
        )
        expect(await browser.elementById('cookie-value').text()).toEqual(
          'Cookie: none'
        )
      })

      expect(await browser.elementById('param-value').text()).toEqual(
        'Post 124'
      )
      expect(await browser.elementById('dynamic-content').text()).toEqual(
        'Post body for 124 with root param: fr'
      )
    })

    it('uses separate static App Shells for links with different root params', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/with-root-param/en', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page, { includeAppShellRequests: true })

      // Reveal the LinkAccordion for /with-root-param/en/static-posts/1. Two prefetch responses
      // fire: one for the per-segment static prefetch of /with-root-param/en/static-posts/1
      // (which contains the resolved page content + the shell above the
      // params boundary), and one for the runtime shell prefetch (which the
      // server may return either as a truncated shell or as the full
      // prerender that the client extracts a shell prefix from). Both
      // responses contain the "App shell for static posts" substring.
      await act(async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/with-root-param/en/static-posts/1"]'
          )
          .click()
      }, [
        { includes: 'App shell for static posts with root param: en' },
        { includes: 'App shell for static posts with root param: en' },
      ])

      await act(async () => {
        const startingUrl = await browser.url()

        // Click the link to /with-root-param/pl/static-posts/125. This link is rendered with
        // prefetch={false}, so it was never prefetched.
        // It uses a different root param value ("pl", not "en"), so we shouldn't use
        // the App Shell we got from the link we revealed, and the navigation should block.
        await browser
          .elementByCss('a[href="/with-root-param/pl/static-posts/125"]')
          .click()

        // Make sure the router actually started the navigation.
        // This will be observable by a pending indicator on the link.
        await browser.elementByCss(
          'a[href="/with-root-param/pl/static-posts/125"] [data-pending]'
        )

        // We're blocked, so the url should stay unchanged
        // and the cached App Shell should not be visible.
        expect(await browser.url()).toEqual(startingUrl)
        expect(await browser.locator('#static-shell').count()).toBe(0)
      })

      // After the outer act unblocks the navigation, the per-URL content
      // streams in.
      expect(await browser.elementById('static-content').text()).toEqual(
        'Static post 125 with root param: pl'
      )

      // Go back to the home page, then repeat the "prefetch post / navigate to
      // an unprefetched post that shares its shell" flow (from the "includes
      // root params" tests) with a THIRD root param ("fr"). This proves the
      // freshly prefetched "fr" shell is actually used — not the earlier "en"
      // shell.
      await browser.back()

      await act(
        async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/with-root-param/fr/static-posts/1"]'
            )
            .click()
        },
        [
          // TODO(app-shells): why aren't there requests here?
          // { includes: 'App shell for static posts with root param: fr' },
          // { includes: 'App shell for static posts with root param: fr' },
        ]
      )

      await act(async () => {
        // Navigate to an unprefetched post that shares the "fr" shell. The
        // cached "fr" shell (not "en") should render immediately, before the
        // navigation response arrives.
        await browser
          .elementByCss('a[href="/with-root-param/fr/static-posts/124"]')
          .click()

        expect(await browser.elementById('static-shell').text()).toEqual(
          'App shell for static posts with root param: fr'
        )
      })

      // After the outer act unblocks the navigation, the per-URL content
      // streams in.
      expect(await browser.elementById('static-content').text()).toEqual(
        'Static post 124 with root param: fr'
      )
    })
  })
})
