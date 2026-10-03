import cheerio from 'cheerio'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('cached navigations', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: path.join(__dirname, 'default'),
  })

  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

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

  it('caches segments when navigating to a known route without a prefetch', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // First navigation — seeds the route cache (stale after 5 min) and
    // segment cache from the embedded runtime prefetch.
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

    // Fast-forward past the segment cache stale time but under the route
    // cache stale time (5 min). Segment entries are now expired, but the
    // route is still known.
    await page.clock.fastForward(130_000)

    // Second navigation — the route is known but all segment entries have
    // expired, so nothing is served from the cache. The response embeds a
    // fresh runtime prefetch, which is written into the segment cache.
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

    // Third navigation — block the dynamic request to test whether cached
    // segments are available.
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

      // The second navigation wrote into the segment cache, so the cached
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

  it('includes static params in the embedded runtime prefetch', async () => {
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

    // Second navigation — the params are visible while the dynamic request
    // is blocked
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

  it('includes fallback params in the embedded runtime prefetch', async () => {
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
          .elementByCss('a[href="/partial-fallback-params/foo"]')
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

    // Second navigation — the runtime prefetch rendered the param's value, so
    // it's visible while the dynamic request is blocked
    await act(async () => {
      await act(
        async () => {
          await browser
            .elementByCss('a[href="/partial-fallback-params/foo"]')
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
      expect(await browser.elementById('params-boundary').text()).toContain(
        'Param: foo'
      )
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, all content should be visible
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })

  // The legacy Vercel builder incorrectly prerenders params omitted from
  // generateStaticParams.
  // @gate !deploy || adapter
  it('caches params from a cold RSC navigation for repeated navigations', async () => {
    const top = 't2'
    const route = `/required-fallback-params/${top}/b1`
    const startDate = Date.now()
    let page: Playwright.Page
    const browser = await next.browser(`/fallback-params-hub/${top}/start`, {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
        await page.clock.setFixedTime(startDate)
      },
    })
    const act = createRouterAct(page)

    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
        await browser.elementByCss(`a[href="${route}"]`).click()
      },
      { includes: 'Dynamic content' }
    )

    expect(await browser.elementById('top').text()).toBe(`Top: ${top}`)
    expect(await browser.elementById('bottom').text()).toBe('Bottom: b1')
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )

    for (const [index, step] of ['a', 'b'].entries()) {
      const hub = `/fallback-params-hub/${top}/${step}`
      await act(
        async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${hub}"]`)
            .click()
          await browser.elementByCss(`a[href="${hub}"]`).click()
        },
        { includes: `Fallback params hub ${step}` }
      )
      expect(await browser.elementByCss('h1').text()).toBe(
        `Fallback params hub ${step}`
      )
      await page.clock.setFixedTime(startDate + (index + 1) * 60_000)

      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(`input[data-link-accordion="${route}"]`)
              .click()
            await browser.elementByCss(`a[href="${route}"]`).click()
          },
          { includes: 'Dynamic content', block: true }
        )

        expect(await browser.elementById('top').text()).toBe(`Top: ${top}`)
        expect(await browser.elementById('bottom').text()).toBe('Bottom: b1')
        expect(await browser.elementById('connection-boundary').text()).toBe(
          'Loading connection...'
        )
      })

      expect(await browser.elementById('top').text()).toBe(`Top: ${top}`)
      expect(await browser.elementById('bottom').text()).toBe('Bottom: b1')
      expect(await browser.elementById('dynamic-content').text()).toBe(
        'Dynamic content'
      )
    }

    // Another bottom value must not show b1's cached bottom.
    const hub = `/fallback-params-hub/${top}/a`
    const otherRoute = `/required-fallback-params/${top}/b2`
    // The layout's hub link was already revealed in the loop.
    await act(
      async () => {
        await browser.elementByCss(`a[href="${hub}"]`).click()
      },
      { includes: 'Fallback params hub a' }
    )
    await act(async () => {
      await act(
        async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${otherRoute}"]`)
            .click()
          await browser.elementByCss(`a[href="${otherRoute}"]`).click()
        },
        { includes: 'Dynamic content', block: true }
      )

      expect(await browser.elementById('top').text()).toBe(`Top: ${top}`)
      expect(await browser.elementById('bottom-boundary').text()).toBe(
        'Loading bottom...'
      )
    })
  })

  // The legacy Vercel builder incorrectly prerenders params omitted from
  // generateStaticParams.
  // @gate !deploy || adapter
  it('caches params from an initial HTML on-demand prerender for repeated navigations', async () => {
    const top = 't3'
    const route = `/required-fallback-params/${top}/b1`
    const startDate = Date.now()
    let page: Playwright.Page
    let initialDocument: Promise<Playwright.Response>
    const browser = await next.browser(route, {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
        await page.clock.setFixedTime(startDate)
        initialDocument = page.waitForResponse((response) =>
          response.request().isNavigationRequest()
        )
      },
    })
    const act = createRouterAct(page)

    // Inspect the document that populated this browser's cache, not a separate
    // prefetch or a later request after the shell was cached.
    const response = await initialDocument
    expect(response.status()).toBe(200)
    const html = await response.text()
    const [shell, resume] = html.split('<!-- PPR_BOUNDARY_SENTINEL -->')
    expect(resume).toBeDefined()
    const $ = cheerio.load(shell)
    expect($('#top').text()).toBe(`Top: ${top}`)
    expect($('#bottom').length).toBe(0)
    expect($('#bottom-boundary').text()).toBe('Loading bottom...')
    expect($('#dynamic-content').length).toBe(0)
    expect($('#connection-boundary').text()).toBe('Loading connection...')
    expect(resume).toContain('id="bottom"')
    expect(resume).toContain('id="dynamic-content"')

    expect(await browser.elementById('top').text()).toBe(`Top: ${top}`)
    expect(await browser.elementById('bottom').text()).toBe('Bottom: b1')
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )

    for (const [index, step] of ['a', 'b'].entries()) {
      const hub = `/fallback-params-hub/${top}/${step}`
      await act(
        async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${hub}"]`)
            .click()
          await browser.elementByCss(`a[href="${hub}"]`).click()
        },
        { includes: `Fallback params hub ${step}` }
      )
      expect(await browser.elementByCss('h1').text()).toBe(
        `Fallback params hub ${step}`
      )
      await page.clock.setFixedTime(startDate + (index + 1) * 60_000)

      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss(`input[data-link-accordion="${route}"]`)
              .click()
            await browser.elementByCss(`a[href="${route}"]`).click()
          },
          { includes: 'Dynamic content', block: true }
        )

        expect(await browser.elementById('top').text()).toBe(`Top: ${top}`)
        expect(await browser.elementById('bottom').text()).toBe('Bottom: b1')
        expect(await browser.elementById('connection-boundary').text()).toBe(
          'Loading connection...'
        )
      })

      expect(await browser.elementById('top').text()).toBe(`Top: ${top}`)
      expect(await browser.elementById('bottom').text()).toBe('Bottom: b1')
      expect(await browser.elementById('dynamic-content').text()).toBe(
        'Dynamic content'
      )
    }
  })

  it('caches a fully static on-demand param for repeated navigations', async () => {
    const route = '/fully-static-params/t4'
    const startDate = Date.now()
    let page: Playwright.Page
    const browser = await next.browser('/fallback-params-hub/t4/start', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
        await page.clock.setFixedTime(startDate)
      },
    })
    const act = createRouterAct(page)

    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
        await browser.elementByCss(`a[href="${route}"]`).click()
      },
      { includes: 'Top:' }
    )
    expect(await browser.elementById('top').text()).toBe('Top: t4')

    for (const [index, step] of ['a', 'b'].entries()) {
      const hub = `/fallback-params-hub/t4/${step}`
      await act(
        async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${hub}"]`)
            .click()
          await browser.elementByCss(`a[href="${hub}"]`).click()
        },
        { includes: `Fallback params hub ${step}` }
      )
      expect(await browser.elementByCss('h1').text()).toBe(
        `Fallback params hub ${step}`
      )
      await page.clock.setFixedTime(startDate + (index + 1) * 60_000)

      const navigate = async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
        await browser.elementByCss(`a[href="${route}"]`).click()
      }
      if (isNextDeploy) {
        // The platform serves a completed static prerender, not an unmarked
        // live-render prefix.
        await act(navigate, 'no-requests')
        expect(await browser.elementById('top').text()).toBe('Top: t4')
        continue
      }

      await act(async () => {
        await act(navigate, { includes: 'Top:', block: true })

        // A live navigation response is marked partial even for a static
        // page, so nothing from it was written into the cache.
        expect(await browser.elementByCss('main').text()).not.toContain(
          'Top: t4'
        )
      })
      expect(await browser.elementById('top').text()).toBe('Top: t4')
    }
  })

  it('does not cache synchronous IO after a novel param resolves', async () => {
    const route = '/partial-fully-static-params/time'
    if (isNextDeploy) {
      // The platform must prerender this cold route before it can resume it.
      // The prerender rejects the uncached timestamp instead of serving a
      // cacheable result.
      const response = await next.fetch(route)
      expect(response.status).toBe(500)
      expect(await response.text()).not.toContain('Top: time')
      return
    }
    const hub = '/fallback-params-hub/time/a'
    let page: Playwright.Page
    const browser = await next.browser('/fallback-params-hub/time/start', {
      async beforePageLoad(browserPage: Playwright.Page) {
        page = browserPage
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
        await browser.elementByCss(`a[href="${route}"]`).click()
      },
      { includes: 'Top:' }
    )
    const timestamp = await browser.elementById('timestamp').text()
    expect(timestamp).not.toBe('')

    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${hub}"]`)
          .click()
        await browser.elementByCss(`a[href="${hub}"]`).click()
      },
      { includes: 'Fallback params hub a' }
    )
    await page.clock.fastForward(60_000)

    await act(async () => {
      await act(
        async () => {
          await browser
            .elementByCss(`input[data-link-accordion="${route}"]`)
            .click()
          await browser.elementByCss(`a[href="${route}"]`).click()
        },
        { includes: 'Top:', block: true }
      )

      expect(await browser.elementByCss('main').text()).not.toContain(
        'Top: time'
      )
    })
    expect(await browser.elementById('timestamp').text()).not.toBe(timestamp)
  })

  it('finishes a full prefetch after synchronous IO interrupts its shell', async () => {
    const route = '/fully-static-params/time'
    if (isNextDeploy) {
      const response = await next.fetch(route)
      expect(response.status).toBe(500)
      return
    }

    let page: Playwright.Page
    const browser = await next.browser('/fallback-params-hub/time/start', {
      beforePageLoad(browserPage: Playwright.Page) {
        page = browserPage
      },
    })
    const act = createRouterAct(page)
    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${route}"]`)
          .click()
        await browser.elementByCss(`a[href="${route}"]`).click()
      },
      { includes: 'Top:' }
    )
    const timestamp = await browser.elementById('timestamp').text()

    const hub = '/fallback-params-hub/time/a'
    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${hub}"]`)
          .click()
        await browser.elementByCss(`a[href="${hub}"]`).click()
      },
      { includes: 'Fallback params hub a' }
    )
    await act(
      async () => {
        await browser.eval('window.next.router.refresh()')
      },
      { includes: 'Fallback params hub a' }
    )

    // Refresh clears segment data and BFCache but retains the route tree. The
    // full prefetch must fetch new data without a cold static tree prerender.
    const fullPrefetchLink = `${route}#full-prefetch`
    await act(
      async () => {
        await browser
          .elementByCss(`input[data-link-accordion="${fullPrefetchLink}"]`)
          .click()
      },
      { includes: 'Top:' }
    )

    await act(async () => {
      await browser.elementByCss(`a[href="${fullPrefetchLink}"]`).click()
    }, 'no-requests')
    expect(await browser.elementById('top').text()).toBe('Top: time')
    expect(await browser.elementById('timestamp').text()).not.toBe(timestamp)
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
    // With instant { prefetch: 'runtime' }, runtime-prefetchable
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

  it('caches runtime-prefetchable content from the initial HTML for subsequent navigations', async () => {
    let page: Playwright.Page
    // Start directly at /runtime-prefetchable — full HTML load, not a
    // client-side navigation. The RSC payload is inlined in the HTML and
    // includes an embedded runtime prefetch stream (`p` field) that the client
    // writes into the segment cache during hydration.
    const browser = await next.browser('/runtime-prefetchable', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // Wait for all content to stream in (the dynamic content uses connection()
    // + setTimeout, so it arrives late).
    await retry(async () => {
      expect(await browser.elementById('connection-boundary').text()).toContain(
        'Dynamic content'
      )
    })

    // Verify runtime-prefetchable content is also visible
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

    // Navigate to the home page
    await act(async () => {
      await browser.elementByCss('a[href="/"]').click()
    })
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Navigate back to the runtime-prefetchable page. The static content and
    // runtime-prefetchable content (cookies, headers, searchParams) should be
    // cached from the initial HTML load. Only truly dynamic content
    // (connection()) needs a server request.
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

      // While the dynamic request is blocked, verify that runtime-prefetchable
      // content is rendered instantly from the cache.
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

      // The truly dynamic content (connection()) is not runtime-prefetchable
      // and should still be in its loading state.
      expect(await browser.elementById('connection-boundary').text()).toContain(
        'Loading connection...'
      )
    })

    // After the outer act completes, the blocked dynamic response is released
    // and the truly dynamic content should be visible.
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
      // while the request is blocked.
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

    // Navigate back to /partially-static. The embedded runtime prefetch was
    // cached during the initial HTML load, so cached content should be
    // available instantly while the dynamic content streams in.
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

  it('reuses cached page segment across different fallback params after navigation', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // First navigation to /partial-fallback-params/foo — seeds the segment
    // cache. The shell of the embedded runtime prefetch doesn't depend on the
    // slug, so another slug can reuse it.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/partial-fallback-params/foo"]')
          .click()
      },
      { includes: 'Dynamic content' }
    )
    expect(await browser.elementById('params-boundary').text()).toContain(
      'Param: foo'
    )

    // Click the bar link. The page segment's shell should be reused from
    // cache, so the Suspense fallback for params should appear instantly.
    await act(async () => {
      await act(
        async () => {
          await browser
            .elementByCss('a[href="/partial-fallback-params/bar"]')
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
      // The page segment is reused — params boundary shows Suspense fallback
      expect(await browser.elementById('params-boundary').text()).toBe(
        'Loading params...'
      )
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, all content should be visible with the new param
    expect(await browser.elementById('params-boundary').text()).toContain(
      'Param: bar'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })

  it('reuses cached page segment across different fallback params after initial HTML load', async () => {
    let page: Playwright.Page
    // Start directly at /partial-fallback-params/foo — full HTML load. The
    // runtime prefetch embedded in the initial RSC payload seeds the segment
    // cache with the page segment, whose shell doesn't depend on the slug.
    const browser = await next.browser('/partial-fallback-params/foo', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Wait for all content to stream in
    await retry(async () => {
      expect(await browser.elementById('connection-boundary').text()).toContain(
        'Dynamic content'
      )
    })
    expect(await browser.elementById('params-boundary').text()).toContain(
      'Param: foo'
    )

    // Wait for a real request first, so the hydration-time write has finished.
    await act(
      async () => {
        await browser.elementByCss('a[href="/partial-fallback-params"]').click()
      },
      { includes: 'Partial fallback params hub' }
    )

    // Click the bar link. The page segment should be reused from the cache
    // seeded by the initial HTML load.
    await act(async () => {
      await act(
        async () => {
          await browser
            .elementByCss('a[href="/partial-fallback-params/bar"]')
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
      // The page segment is reused — params boundary shows Suspense fallback
      expect(await browser.elementById('params-boundary').text()).toBe(
        'Loading params...'
      )
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, all content should be visible with the new param
    expect(await browser.elementById('params-boundary').text()).toContain(
      'Param: bar'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })

  it('does not reuse anything from a draft mode HTML load', async () => {
    let page: Playwright.Page
    const browser = await next.browser(
      '/api/draft/enable?to=/partial-fallback-params/foo',
      {
        async beforePageLoad(p: Playwright.Page) {
          page = p
        },
      }
    )
    const act = createRouterAct(page)

    try {
      await retry(async () => {
        expect(
          await browser.elementById('connection-boundary').text()
        ).toContain('Dynamic content')
      })
      expect(await browser.elementById('params-boundary').text()).toContain(
        'Param: foo'
      )

      // Wait for a real request first, so the hydration-time write has
      // finished.
      await act(
        async () => {
          await browser
            .elementByCss('a[href="/partial-fallback-params"]')
            .click()
        },
        { includes: 'Partial fallback params hub' }
      )

      await act(async () => {
        await act(
          async () => {
            await browser
              .elementByCss('a[href="/partial-fallback-params/bar"]')
              .click()
          },
          {
            includes: 'Dynamic content',
            block: true,
          }
        )

        // Draft mode doesn't keep 'use cache' results for the embedded
        // prefetch, so nothing is reusable.
        expect(await browser.elementByCss('h1').text()).toBe(
          'Partial fallback params hub'
        )
        expect(await browser.elementByCss('main').text()).not.toContain(
          'Cached content'
        )
      })

      expect(await browser.elementById('params-boundary').text()).toContain(
        'Param: bar'
      )
      expect(await browser.elementById('connection-boundary').text()).toContain(
        'Dynamic content'
      )
    } finally {
      await page.context().clearCookies()
    }
  })

  it('does not leak resolved param-specific content across params when using prefetch={true}', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/with-fallback-params', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // 1. Unveil the foo link. With prefetch={true} this triggers a Full
    //    dynamic prefetch that returns the fully rendered page.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/with-fallback-params/foo"]')
        .click()
    })

    // 2. Navigate to /with-fallback-params/foo using the prefetched data.
    await act(async () => {
      await browser.elementByCss('a[href="/with-fallback-params/foo"]').click()
    }, 'no-requests')
    await retry(async () => {
      expect(await browser.elementById('params-boundary').text()).toBe(
        'Param: foo'
      )
    })

    // 3. Return to the hub via the layout's back link.
    await browser.elementByCss('a[href="/with-fallback-params"]')?.click()
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe(
        'Fallback Params Hub'
      )
    })

    // 4. Unveil the bar link.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/with-fallback-params/bar"]')
        .click()
    })

    // 5. Navigate to /with-fallback-params/bar; should render bar's content
    //    (sourced from the bar prefetch in step 4), not foo's.
    await act(async () => {
      await browser.elementByCss('a[href="/with-fallback-params/bar"]').click()
    }, 'no-requests')
    await retry(async () => {
      const barContent = await browser.elementById('params-boundary').text()
      expect(barContent).toBe('Param: bar')
      expect(barContent).not.toContain('foo')
    })
  })

  // A `prefetch` config that enables Partial Prefetching ('partial') also opts
  // the route into runtime Cached Navigations, even though this fixture does
  // not set the global `partialPrefetching` flag.
  async function expectRuntimeCachedOnSecondNavigation(route: string) {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // First navigation — full dynamic request, no prefetch.
    await act(
      async () => {
        await browser.elementByCss(`a[href="${route}"]`).click()
      },
      { includes: 'Dynamic content' }
    )
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )

    // Navigate back to home.
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Second navigation — the request-derived content was runtime-cached from
    // the first navigation and shows instantly even with the dynamic request
    // blocked. Only connection() needs a server request.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss(`a[href="${route}"]`).click()
        },
        { includes: 'Dynamic content', block: true }
      )

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
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  }

  it('runtime-caches a route with prefetch = "partial"', async () => {
    await expectRuntimeCachedOnSecondNavigation('/prefetch-partial')
  })

  it('cache values are consistent across the HTML shell, static prefetches, and cached navigations', async () => {
    const href = '/cache-from-rdc'
    const htmlId = 'cached-data'

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    const getRenderId = async (): Promise<string> => {
      return await browser.elementById('render-id').text()
    }

    // Reveal a link to the page. This should result in a static prefetch.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `[data-prefetch="auto"] input[data-link-accordion="${href}"]`
      )
      await linkToggle.click()
    }, [
      {
        includes: 'cache-timestamp:',
        kind: 'static',
      },
    ])

    //===========================
    // Test client navigation
    //===========================

    // Navigate to the page.
    const { cachedValueFromPrefetch, prefetchRenderId } = await act(
      async () => {
        await browser
          .elementByCss(`[data-prefetch="auto"] a[href="${href}"]`)
          .click()

        const cachedValueFromPrefetch = await browser.elementById(htmlId).text()
        const prefetchRenderId = await getRenderId()
        return { cachedValueFromPrefetch, prefetchRenderId }
      },
      { includes: 'Dynamic data' }
    )
    {
      expect(await browser.elementById('dynamic-data').text()).toBe(
        'Dynamic data'
      )

      // The navigation response should also contain the same cache value.
      expect(await browser.elementById(htmlId).text()).toBe(
        cachedValueFromPrefetch
      )
      const clientNavRenderId = await getRenderId()

      // Navigate back to the index page.
      await act(
        () => browser.elementByCss('a[href="/"]').click(),
        'no-requests'
      )
      // Then, navigate to the page again (without a prefetch).
      // We should re-use the cacheable part of the UI from the navigation.
      await act(
        async () => {
          await browser
            .elementByCss(`[data-prefetch="false"] a[href="${href}"]`)
            .click()

          // Make sure we're showing the content from the cached navigation,
          // not the static prefetch -- otherwise, the cache consistency check
          // would be meaningless.
          const visibleRenderId = await getRenderId()
          expect(visibleRenderId).not.toBe(prefetchRenderId)
          expect(visibleRenderId).toBe(clientNavRenderId)

          // The cacheable UI extracted from the navigation (shown while navigating)
          // should have the same cache value.
          expect(await browser.elementById(htmlId).text()).toBe(
            cachedValueFromPrefetch
          )
        },
        { includes: 'Dynamic data' }
      )

      expect(await browser.elementById('dynamic-data').text()).toBe(
        'Dynamic data'
      )

      // The second navigation result should have the same cache value.
      expect(await browser.elementById(htmlId).text()).toBe(
        cachedValueFromPrefetch
      )
      // We have uncached data, so this was a fresh render.
      expect(await getRenderId()).not.toBe(clientNavRenderId)
    }

    //===========================
    // Test initial load
    //===========================
    {
      await browser.refresh()

      expect(await browser.elementById('dynamic-data').text()).toBe(
        'Dynamic data'
      )
      // The initial load should have the same cache value.
      expect(await browser.elementById(htmlId).text()).toBe(
        cachedValueFromPrefetch
      )
      const initialLoadRenderId = await getRenderId()

      // Navigate to the index page.
      await act(() => browser.elementByCss('a[href="/"]').click())
      // Then, navigate back to the page without a prefetch.
      // We should re-use the cacheable part of the UI from the navigation.
      await act(
        async () => {
          await browser
            .elementByCss(`[data-prefetch="false"] a[href="${href}"]`)
            .click()

          // Make sure we're showing the content from the cached navigation.
          const visibleRenderId = await getRenderId()
          expect(visibleRenderId).toBe(initialLoadRenderId)

          // The cacheable UI extracted from the navigation (shown while navigating)
          // should have the same cache value.
          expect(await browser.elementById(htmlId).text()).toBe(
            cachedValueFromPrefetch
          )
        },
        { includes: 'Dynamic data' }
      )

      expect(await browser.elementById('dynamic-data').text()).toBe(
        'Dynamic data'
      )

      // The second navigation result should have the same cache value.
      expect(await browser.elementById(htmlId).text()).toBe(
        cachedValueFromPrefetch
      )
      // We have uncached data, so this was a fresh render.
      expect(await getRenderId()).not.toBe(initialLoadRenderId)
    }
  })
})
