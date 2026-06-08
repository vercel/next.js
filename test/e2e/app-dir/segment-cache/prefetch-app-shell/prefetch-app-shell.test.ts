import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

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
    const act = createRouterAct(page)

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

  it('skips the per-link Speculative prefetch for a non-eager (force-runtime) route', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal /posts/1 (default/auto prefetch). The route is force-runtime, which
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

  it('skips the per-link Speculative prefetch for a route with unstable_prefetch = "partial"', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

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

  it('does NOT skip the Speculative prefetch for a route with unstable_prefetch = "unstable_eager"', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

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

  it('treats a segment with both unstable_instant and unstable_prefetch = "unstable_eager" as eager', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // /eager-instant/[id] sets BOTH unstable_instant (which alone behaves like
    // 'partial' — not eager) and unstable_prefetch = 'unstable_eager'. The eager
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
    const act = createRouterAct(page)

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
    const act = createRouterAct(page)

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
})
