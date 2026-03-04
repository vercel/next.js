import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('cached navigations', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('serves cached static segments instantly on the second navigation', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // First navigation — full dynamic request, no prefetch
    await act(
      async () => {
        await browser.elementByCss('a[href="/partially-static"]').click()
      },
      { includes: 'Dynamic content' }
    )

    // Verify all content is visible
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(
      await browser.elementById('search-params-boundary').text()
    ).toContain('Search params:')
    expect(await browser.elementById('cookies-boundary').text()).toContain(
      'Cookie:'
    )
    expect(await browser.elementById('headers-boundary').text()).toContain(
      'Header:'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )

    // Navigate back to home
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Fast-forward time past the short-lived runtime cache's stale time (30s)
    // but under the static cache's stale time (120s). If the stale time sent to
    // the client incorrectly used the runtime cache's value, the cached
    // segments would have expired and the second navigation wouldn't be
    // instant.
    await page.clock.fastForward(60_000)

    // Second navigation — cached static data should show immediately
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/partially-static"]').click()
        },
        {
          // Block the dynamic request. The cached/prefetchable content
          // should still be visible even though the dynamic data hasn't
          // arrived yet.
          includes: 'Dynamic content',
          block: true,
        }
      )

      // The static/cached part should be visible while the dynamic
      // request is still blocked
      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )

      // Runtime and dynamic content should show Suspense fallbacks
      expect(await browser.elementById('search-params-boundary').text()).toBe(
        'Loading search params...'
      )
      expect(await browser.elementById('cookies-boundary').text()).toBe(
        'Loading cookies...'
      )
      expect(await browser.elementById('headers-boundary').text()).toBe(
        'Loading headers...'
      )
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, all content should be visible
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(
      await browser.elementById('search-params-boundary').text()
    ).toContain('Search params:')
    expect(await browser.elementById('cookies-boundary').text()).toContain(
      'Cookie:'
    )
    expect(await browser.elementById('headers-boundary').text()).toContain(
      'Header:'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )

    // Navigate back to home again
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Fast-forward past the static cache's stale time (120s). The cached
    // segments should now be expired, so the third navigation should NOT
    // show cached content instantly — it should block on the full response.
    await page.clock.fastForward(120_000)

    // Third navigation — cache is stale, no cached content should be shown
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/partially-static"]').click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      // With stale cache, nothing from the target page should be visible
      // while the request is blocked — not even the cached content.
      const mainText = await (await browser.elementByCss('main')).innerText()
      expect(mainText).not.toContain('Cached content')
    })

    // After unblocking, all content should be visible
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })

  it('serves a fully static page without any requests on the second navigation', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // First navigation — full request, no prefetch
    await act(
      async () => {
        await browser.elementByCss('a[href="/fully-static"]').click()
      },
      { includes: 'Cached content' }
    )
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )

    // Navigate back to home
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Second navigation — fully cached, should not issue any requests
    await act(async () => {
      await browser.elementByCss('a[href="/fully-static"]').click()
    }, 'no-requests')
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
  })

  it('caches static segments when navigating to a known route without a prefetch', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // First navigation — seeds the route cache (stale after 5 min) and
    // segment cache (stale after 120s, from cacheLife({ stale: 120 })).
    await act(
      async () => {
        await browser.elementByCss('a[href="/partially-static"]').click()
      },
      { includes: 'Dynamic content' }
    )
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )

    // Navigate back to home
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Fast-forward past the segment cache stale time (120s) but under the
    // route cache stale time (5 min). Segment entries are now expired, but
    // the route is still known.
    await page.clock.fastForward(130_000)

    // Second navigation — the route is known but all segment entries have
    // expired, so nothing is served from the cache. The server responds
    // with fresh data including a static stage, which is written into the
    // segment cache for future navigations.
    await act(
      async () => {
        await browser.elementByCss('a[href="/partially-static"]').click()
      },
      { includes: 'Dynamic content' }
    )
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )

    // Navigate back to home again
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Fast-forward 60s — well under the 120s stale time that the segment
    // entries would have if the second navigation had cached them.
    await page.clock.fastForward(60_000)

    // Third navigation — block the dynamic request to test whether cached
    // static segments are available.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/partially-static"]').click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      // The second navigation wrote the static stage into the segment
      // cache. These entries are still fresh (60s < 120s) so the cached
      // content is visible while the dynamic request is pending.
      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )

      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, all content should be visible
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })

  it('includes static params in the cached static stage', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // First navigation
    await act(
      async () => {
        await browser.elementByCss('a[href="/with-static-params/foo"]').click()
      },
      { includes: 'Dynamic content' }
    )
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(await browser.elementById('params').text()).toContain('Param: foo')

    // Navigate back
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    await page.clock.fastForward(60_000)

    // Second navigation — params are static, so they should be included in
    // the cached static stage and visible while the dynamic request is blocked
    await act(async () => {
      await act(
        async () => {
          await browser
            .elementByCss('a[href="/with-static-params/foo"]')
            .click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )
      // Static params should be visible — they resolve during the static stage
      expect(await browser.elementById('params').text()).toContain('Param: foo')
      // Dynamic content should show Suspense fallback
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, dynamic content should be visible
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })

  it('defers fallback params to the runtime stage', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // First navigation — "foo" is not in generateStaticParams, so it's a
    // fallback param
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/with-fallback-params/foo"]')
          .click()
      },
      { includes: 'Dynamic content' }
    )
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(await browser.elementById('params-boundary').text()).toContain(
      'Param: foo'
    )

    // Navigate back
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    await page.clock.fastForward(60_000)

    // Second navigation — fallback params are deferred to the runtime stage,
    // so they should NOT be visible while the dynamic request is blocked
    await act(async () => {
      await act(
        async () => {
          await browser
            .elementByCss('a[href="/with-fallback-params/foo"]')
            .click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )
      // Fallback params should show Suspense fallback — deferred to runtime
      expect(await browser.elementById('params-boundary').text()).toBe(
        'Loading params...'
      )
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, all content should be visible
    expect(await browser.elementById('params-boundary').text()).toContain(
      'Param: foo'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })

  it('caches runtime-prefetchable content from a navigation for instant second visit', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // First navigation — full dynamic request, no prefetch
    await act(
      async () => {
        await browser.elementByCss('a[href="/runtime-prefetchable"]').click()
      },
      { includes: 'Dynamic content' }
    )

    // Verify all content is visible
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(
      await browser.elementById('search-params-boundary').text()
    ).toContain('Search params:')
    expect(await browser.elementById('cookies-boundary').text()).toContain(
      'Cookie:'
    )
    expect(await browser.elementById('headers-boundary').text()).toContain(
      'Header:'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )

    // Navigate back to home
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Second navigation — no time has passed, so both the static cache
    // (stale: 120s) and the runtime cache (stale: 30s from the
    // short-lived cache entry in CookiesContent) should still be fresh.
    // With unstable_instant { prefetch: 'runtime' }, runtime-prefetchable
    // content (cookies, headers, searchParams) should be cached from the
    // first navigation and show instantly alongside the static content.
    // Only truly dynamic content (connection()) needs a server request.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/runtime-prefetchable"]').click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      // Static cached content should be visible
      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )

      // Runtime-prefetchable content should also be visible (cached from
      // the first navigation's embedded runtime prefetch stream)
      expect(
        await browser.elementById('search-params-boundary').text()
      ).toContain('Search params:')
      expect(await browser.elementById('cookies-boundary').text()).toContain(
        'Cookie:'
      )
      expect(await browser.elementById('headers-boundary').text()).toContain(
        'Header:'
      )

      // Only connection() content should show a Suspense fallback — it's
      // truly dynamic and not runtime-prefetchable
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, all content should be visible
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(
      await browser.elementById('search-params-boundary').text()
    ).toContain('Search params:')
    expect(await browser.elementById('cookies-boundary').text()).toContain(
      'Cookie:'
    )
    expect(await browser.elementById('headers-boundary').text()).toContain(
      'Header:'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )

    // Navigate back to home again
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Fast-forward past the runtime cache's stale time (30s).
    await page.clock.fastForward(60_000)

    // Third navigation — runtime cache is stale. Verify the navigation
    // blocks on a full server request (nothing is cached).
    //
    // TODO: Ideally, the static cache (120s stale) should survive and show
    // static content instantly even after the runtime cache expires. Currently
    // the runtime prefetch write (PPRRuntime) evicts the static cache entry
    // (PPR) via the fallback lookup in upsertSegmentEntry, so there's no
    // static fallback after the runtime entry expires. This needs a layered
    // cache approach where entries with different fetch strategies / stale
    // times coexist independently.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/runtime-prefetchable"]').click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      // With a stale cache, nothing from the target page should be visible
      // while the request is blocked. The navigation stays on the home page.
      const mainText = await (await browser.elementByCss('main')).innerText()
      expect(mainText).not.toContain('Cached content')
      expect(mainText).not.toContain('Search params:')
      expect(mainText).not.toContain('Cookie:')
      expect(mainText).not.toContain('Header:')
      expect(mainText).not.toContain('Dynamic content')
    })

    // After unblocking, all content should be visible
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(
      await browser.elementById('search-params-boundary').text()
    ).toContain('Search params:')
    expect(await browser.elementById('cookies-boundary').text()).toContain(
      'Cookie:'
    )
    expect(await browser.elementById('headers-boundary').text()).toContain(
      'Header:'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })

  it('caches a fully static page from the initial HTML for subsequent navigations', async () => {
    let page: Playwright.Page
    // Start directly at /fully-static — full HTML load, not a client-side
    // navigation. The RSC payload is inlined in the HTML and contains only
    // static (cached) content.
    const browser = await next.browser('/fully-static', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // Verify the page rendered fully via HTML
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )

    // Navigate to home
    await act(
      async () => {
        await browser.elementByCss('a[href="/"]').click()
      },
      { includes: 'Home' }
    )
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Navigate back to /fully-static. Since it was fully static and cached
    // during the initial HTML load, no server requests should be needed.
    await act(async () => {
      await browser.elementByCss('a[href="/fully-static"]').click()
    }, 'no-requests')
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )

    // Navigate back to home again
    await act(async () => {
      await browser.elementByCss('a[href="/"]').click()
    }, 'no-requests')
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Fast-forward past the stale time (120s from cacheLife({ stale: 120 })).
    // Using 180s to stay well under the 300s default — if we accidentally
    // used the default instead of the collected stale time, this would
    // not expire and the test would fail.
    await page.clock.fastForward(180_000)

    // Navigate to /fully-static again — cache is stale, so a server
    // request should be required.
    await act(
      async () => {
        await browser.elementByCss('a[href="/fully-static"]').click()
      },
      { includes: 'Cached content' }
    )
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
  })

  it('caches a partially static page from the initial HTML for subsequent navigations', async () => {
    let page: Playwright.Page
    // Start directly at /partially-static — full HTML load. The RSC payload
    // inlined in the HTML contains both cached and dynamic content.
    const browser = await next.browser('/partially-static', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // Verify the page rendered fully via HTML. Dynamic content streams in
    // with a delay, so use retry to wait for it.
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    await retry(async () => {
      expect(await browser.elementById('connection-boundary').text()).toContain(
        'Dynamic content'
      )
    })

    // Navigate to home
    await act(
      async () => {
        await browser.elementByCss('a[href="/"]').click()
      },
      { includes: 'Home' }
    )
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Navigate back to /partially-static. The static stage was cached during
    // the initial HTML load, so cached content should be available instantly
    // while the dynamic content streams in.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/partially-static"]').click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      // Cached content should be visible while the dynamic request is blocked
      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )

      // Dynamic content should show Suspense fallbacks
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, all content should be visible
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })
})
