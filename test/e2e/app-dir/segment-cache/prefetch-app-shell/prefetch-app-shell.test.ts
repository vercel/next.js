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
    // reusable for any /posts/[id].
    //
    // The "App shell for posts" substring appears in two responses: one
    // for the App Shell itself and one for the per-link prefetch of
    // /posts/1 (which, for a dynamic page, also includes the shell
    // content above its inner Suspense fallback).
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/posts/1"]')
        .click()
    }, [
      { includes: 'App shell for posts' },
      { includes: 'App shell for posts' },
    ])

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

  it('reuses the app shell across different search param values', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the LinkAccordion for /posts/1. This caches the App Shell.
    // Because the App Shell does not depend on params or search params,
    // it should be reusable across all combinations of either.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/posts/1"]')
        .click()
    }, [
      { includes: 'App shell for posts' },
      { includes: 'App shell for posts' },
    ])

    // Navigate to /posts/125?foo=bar — a different param AND a different
    // search-params value than what was prefetched. The cached App Shell
    // should be reused since it doesn't vary on either.
    await act(async () => {
      await browser.elementByCss('a[href="/posts/125?foo=bar"]').click()

      // While the navigation response is blocked, the cached App Shell
      // should already be visible.
      expect(await browser.elementById('shell').text()).toEqual(
        'App shell for posts'
      )
    })
  })

  it('issues a concrete prefetch for a second link with a different param, even though the shell is already cached', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the LinkAccordion for /posts/1. The "App shell for posts"
    // substring appears in two responses: one for the App Shell itself
    // and one for the per-link prefetch of /posts/1 (which, for a
    // dynamic page, also includes the shell content above its inner
    // Suspense fallback).
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/posts/1"]')
        .click()
    }, [
      { includes: 'App shell for posts' },
      { includes: 'App shell for posts' },
    ])

    // Reveal the LinkAccordion for /posts/2. The App Shell is already
    // cached and reused, but a per-link prefetch should still fire for
    // /posts/2 so that its param-specific content lands in the cache.
    // We assert on that param-specific content to confirm.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/posts/2"]')
        .click()
    }, [{ includes: 'Post 2' }])
  })
})
