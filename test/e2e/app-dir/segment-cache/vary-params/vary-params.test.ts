import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { gate, retry } from 'next-test-utils'

/**
 * Tests for the "vary params" optimization.
 *
 * Background: During prerendering, Next.js tracks which params each segment
 * actually accesses on the server. This enables the client cache to share
 * entries: when a segment doesn't access a param, different values of that
 * param can reuse the same cached segment.
 *
 * Core behavior under test:
 * - When a segment accesses a param, changing that param requires a new prefetch
 * - When a segment does NOT access a param, changing that param reuses the cache
 *
 * The first test (instant loading state) is the canonical demonstration of
 * the feature's user-facing benefit. Subsequent tests exercise various
 * combinations of features and edge cases.
 */
describe('segment cache - vary params', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('prefetching is disabled in dev mode', () => {})
    return
  }

  it('renders cached loading state instantly during navigation', async () => {
    // Setup: All links share category='electronics' but different itemId values.
    // Layout only accesses 'category', page renders itemId dynamically.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/instant-loading', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch the first link - layout is fetched
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/instant-loading/electronics/phone"]'
        )
        await toggle.click()
      },
      { includes: 'Category: electronics' }
    )

    // Prefetch remaining links - all cache hits (same category, layout cached)
    await act(async () => {
      const tablet = await browser.elementByCss(
        'input[data-link-accordion="/instant-loading/electronics/tablet"]'
      )
      await tablet.click()
      const laptop = await browser.elementByCss(
        'input[data-link-accordion="/instant-loading/electronics/laptop"]'
      )
      await laptop.click()
      const headphones = await browser.elementByCss(
        'input[data-link-accordion="/instant-loading/electronics/headphones"]'
      )
      await headphones.click()
    }, 'no-requests')

    // Navigate to headphones. The loading state renders synchronously from
    // the cached layout, before the dynamic request resolves. The assertion
    // runs inside act() during navigation, verifying it appears instantly.
    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/instant-loading/electronics/headphones"]'
      )
      await link.click()

      const loading = await browser.elementByCss('[data-loading="true"]')
      expect(await loading.text()).toContain('Loading item')
    })

    // Dynamic content eventually loads
    const page = await browser.elementById('instant-loading-page')
    expect(await page.text()).toContain('Item: headphones')
  })

  it('reuses prefetched page segment with in-page loading boundary across different params', async () => {
    // Setup: Page uses an in-page Suspense boundary instead of loading.tsx. The
    // page's default export wraps a child component in <Suspense>. The child
    // awaits params, but during prerendering the params are fallback params
    // (hanging promise), so the child suspends and the segment prefetch
    // contains only the Suspense fallback with empty varyParams — making it
    // reusable across all slug values.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/in-page-loading-boundary', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch the first link - page segment is fetched
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/in-page-loading-boundary/phone"]'
        )
        await toggle.click()
      },
      { includes: 'Loading item' }
    )

    // Prefetch remaining links - all cache hits (page prefetch is shared)
    await act(async () => {
      const tablet = await browser.elementByCss(
        'input[data-link-accordion="/in-page-loading-boundary/tablet"]'
      )
      await tablet.click()
      const laptop = await browser.elementByCss(
        'input[data-link-accordion="/in-page-loading-boundary/laptop"]'
      )
      await laptop.click()
      const headphones = await browser.elementByCss(
        'input[data-link-accordion="/in-page-loading-boundary/headphones"]'
      )
      await headphones.click()
    }, 'no-requests')

    // Navigate to headphones. The loading state renders instantly from the
    // cached page shell (Suspense fallback), before the dynamic request
    // resolves.
    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/in-page-loading-boundary/headphones"]'
      )
      await link.click()

      const loading = await browser.elementByCss('[data-loading="true"]')
      expect(await loading.text()).toContain('Loading item')
    })

    // Dynamic content eventually loads
    const content = await browser.elementById(
      'in-page-loading-boundary-content'
    )
    expect(await content.text()).toContain('Item: headphones')
  })

  it('renders cached loading state instantly with runtime prefetching', async () => {
    // Setup: Page accesses `category` in static portion (tracked in varyParams),
    // but accesses `itemId` only after connection() (not tracked).
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/runtime-prefetch', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch first link - static content fetched
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch/electronics/phone"]'
        )
        await toggle.click()
      },
      { includes: 'Static content - Category: electronics' }
    )

    // Prefetch remaining links with same category - all cache hits
    await act(async () => {
      const tablet = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch/electronics/tablet"]'
      )
      await tablet.click()
      const laptop = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch/electronics/laptop"]'
      )
      await laptop.click()
      const headphones = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch/electronics/headphones"]'
      )
      await headphones.click()
    }, 'no-requests')

    // Prefetch link with different category - triggers new prefetch
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch/clothing/shirt"]'
        )
        await toggle.click()
      },
      { includes: 'Static content - Category: clothing' }
    )

    // Navigate to headphones. Loading state renders synchronously from cache.
    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/runtime-prefetch/electronics/headphones"]'
      )
      await link.click()

      const loading = await browser.elementByCss('[data-loading="true"]')
      expect(await loading.text()).toContain('Loading item details')
    })

    // Dynamic content eventually loads
    const dynamicContent = await browser.elementByCss('[data-dynamic-content]')
    expect(await dynamicContent.text()).toContain('Item: headphones')
  })

  it('does not reuse prefetched segment when page accesses searchParams', async () => {
    // When a page awaits searchParams, the cache key includes the search
    // params, so different values require separate prefetches.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/search-params', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Each prefetch triggers a new request (not cached)
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/search-params/target-page?foo=1"]'
        )
        await toggle.click()
      },
      { includes: 'Search params target - foo: 1' }
    )

    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/search-params/target-page?foo=2"]'
        )
        await toggle.click()
      },
      { includes: 'Search params target - foo: 2' }
    )

    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/search-params/target-page?foo=3"]'
        )
        await toggle.click()
      },
      { includes: 'Search params target - foo: 3' }
    )
  })

  it('does not reuse prefetched empty-query segment for prefetches with searchParams', async () => {
    // When a page reads searchParams that don't exist on the request URL (e.g.
    // destructuring `foo` from `/search-params/target-page` with no query),
    // that's still an access that affects the response and must register the
    // segment as varying by '?'. Otherwise the empty-query prefetch ends up
    // keyed at the Fallback search-slot, which shadows subsequent ?foo=N
    // prefetches via Fallback resolution and causes them to silently serve the
    // wrong (empty-query) response.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/search-params', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch the no-query URL first. The page reads `foo` (a missing key),
    // which must register as a vary access.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/search-params/target-page"]'
        )
        await toggle.click()
      },
      { includes: 'Search params target - foo: undefined' }
    )

    // Prefetching with a search param value must still trigger a new request,
    // not silently reuse the empty-query entry through Fallback resolution.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/search-params/target-page?foo=1"]'
        )
        await toggle.click()
      },
      { includes: 'Search params target - foo: 1' }
    )

    // Navigate and verify the correct content renders for ?foo=1.
    const link = await browser.elementByCss(
      'a[href="/search-params/target-page?foo=1"]'
    )
    await link.click()
    const content = await browser.elementByCss(
      '[data-search-params-content="true"]'
    )
    expect(await content.text()).toContain('Search params target - foo: 1')
  })

  it('reuses prefetched segment when page does not access searchParams', async () => {
    // When a page does NOT await searchParams, the cache key does NOT include
    // search params, so different values share cached prefetch data.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/search-params', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // First prefetch fetches the segment
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/search-params/static-target?foo=1"]'
        )
        await toggle.click()
      },
      { includes: 'Static target content - no searchParams access' }
    )

    // Subsequent prefetches are cache hits
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/search-params/static-target?foo=2"]'
      )
      await toggle.click()
    }, 'no-requests')

    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/search-params/static-target?foo=3"]'
      )
      await toggle.click()
    }, 'no-requests')
  })

  it('tracks param access in generateMetadata', async () => {
    // Setup: generateMetadata accesses params, but the page body does NOT.
    // This tests that metadata param access is tracked separately.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/metadata', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // First prefetch fetches both head and body
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/metadata/aaa"]'
      )
      await toggle.click()
    }, [{ includes: 'Page: aaa' }, { includes: 'Static page body' }])

    // Second prefetch: head re-fetched (metadata varies on slug),
    // but body is cached (body doesn't access slug)
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/metadata/bbb"]'
      )
      await toggle.click()
    }, [
      { includes: 'Page: bbb' },
      { includes: 'Static page body', block: 'reject' },
    ])
  })

  it('caches head segment when generateMetadata does not access params', async () => {
    // When neither generateMetadata nor the page body access params,
    // both head and body are cached across different param values.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/metadata-no-params', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // First prefetch fetches content
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/metadata-no-params/aaa"]'
        )
        await toggle.click()
      },
      { includes: 'Page content' }
    )

    // Second prefetch is a cache hit
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/metadata-no-params/bbb"]'
      )
      await toggle.click()
    }, 'no-requests')
  })

  it('reuses page segment when layout varies but page does not', async () => {
    // Setup: Layout accesses both `category` and `item`, page only accesses
    // `category`. When item changes but category stays the same, the layout
    // must be re-fetched but the page is cached.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/page-reuse', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // First prefetch fetches both layout and page
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/page-reuse/electronics/phone"]'
      )
      await toggle.click()
    }, [
      { includes: 'Layout: electronics/phone' },
      { includes: 'Page category:' },
    ])

    // Second prefetch: layout re-fetched (varies on item),
    // page is cached (only varies on category)
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/page-reuse/electronics/tablet"]'
      )
      await toggle.click()
    }, [
      { includes: 'Layout: electronics/tablet' },
      { includes: 'Page category:', block: 'reject' },
    ])

    // Navigate to verify cached page content renders correctly
    const link = await browser.elementByCss(
      'a[href="/page-reuse/electronics/tablet"]'
    )
    await link.click()

    const layout = await browser.elementByCss('[data-page-reuse-layout]')
    expect(await layout.text()).toContain('Layout: electronics/tablet')

    const page = await browser.elementById('page-reuse-page')
    expect(await page.text()).toContain('Page category: electronics')
  })

  it('does not reuse cached segment for optional catch-all when page accesses slug', async () => {
    // Setup: Page accesses params.slug directly. Prefetch the empty-slug
    // page first, then verify that prefetching a different slug value
    // triggers a new request (not a cache hit).
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/optional-catchall-index', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch the empty-slug page first
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/optional-catchall"]'
        )
        await toggle.click()
      },
      { includes: 'Slug: none' }
    )

    // Prefetch a different slug — should trigger a new request because the
    // page varies on slug
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/optional-catchall/aaa"]'
        )
        await toggle.click()
      },
      { includes: 'Slug: aaa' }
    )

    // Navigate and verify correct content
    const link = await browser.elementByCss('a[href="/optional-catchall/aaa"]')
    await link.click()

    const page = await browser.elementById('optional-catchall-page')
    expect(await page.text()).toContain('Slug: aaa')
  })

  it('does not reuse cached segment for optional catch-all when page enumerates params', async () => {
    // Setup: Page accesses params via spread ({...params}). Enumeration
    // should cause the segment to vary on the optional catch-all param,
    // even when the param has no value.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/optional-catchall-enumeration-index', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch the empty-slug page first
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/optional-catchall-enumeration"]'
        )
        await toggle.click()
      },
      { includes: 'Slug: none' }
    )

    // Prefetch a different slug — not cached
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/optional-catchall-enumeration/aaa"]'
        )
        await toggle.click()
      },
      { includes: 'Slug: aaa' }
    )

    const link = await browser.elementByCss(
      'a[href="/optional-catchall-enumeration/aaa"]'
    )
    await link.click()

    const page = await browser.elementById('optional-catchall-enumeration-page')
    expect(await page.text()).toContain('Slug: aaa')
  })

  it('does not reuse cached segment for optional catch-all when page checks slug with in operator', async () => {
    // Setup: Page checks for slug using `'slug' in params`. The `in`
    // operator should cause the segment to vary on the optional catch-all
    // param, even when the param has no value.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/optional-catchall-has-index', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch the empty-slug page first
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/optional-catchall-has"]'
        )
        await toggle.click()
      },
      { includes: 'Slug: none' }
    )

    // Prefetch a different slug — not cached
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/optional-catchall-has/aaa"]'
        )
        await toggle.click()
      },
      { includes: 'Slug: aaa' }
    )

    const link = await browser.elementByCss(
      'a[href="/optional-catchall-has/aaa"]'
    )
    await link.click()

    const page = await browser.elementById('optional-catchall-has-page')
    expect(await page.text()).toContain('Slug: aaa')
  })

  it('shares cached segment across all params when none accessed statically (runtime prefetch)', async () => {
    // Both params are accessed only after connection(), so varyParams is
    // empty. ALL param combinations share the same cached loading shell.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/runtime-prefetch-no-vary', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // First prefetch fetches the segment
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-no-vary/electronics/phone"]'
        )
        await toggle.click()
      },
      { includes: 'Loading all content dynamically' }
    )

    // All other combinations are cache hits — even different categories
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch-no-vary/electronics/tablet"]'
      )
      await toggle.click()
    }, 'no-requests')

    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch-no-vary/clothing/shirt"]'
      )
      await toggle.click()
    }, 'no-requests')
  })

  it('does not share cached segment when all params accessed statically (runtime prefetch)', async () => {
    // Both params are accessed before connection(), so every unique
    // combination of (category, itemId) requires its own prefetch.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/runtime-prefetch-all-vary', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Each prefetch triggers a new request
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-all-vary/electronics/phone"]'
        )
        await toggle.click()
      },
      { includes: 'Static content - electronics/phone' }
    )

    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-all-vary/electronics/tablet"]'
        )
        await toggle.click()
      },
      { includes: 'Static content - electronics/tablet' }
    )

    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-all-vary/clothing/shirt"]'
        )
        await toggle.click()
      },
      { includes: 'Static content - clothing/shirt' }
    )
  })

  // TODO: When a Promise resolves with the searchParams Proxy as its value, the
  // Promise spec's `[[Resolve]]` algorithm reads `.then` on the Proxy to check
  // for thenable assimilation. The Proxy can't distinguish that probe from a
  // real `searchParams.then` access, so any runtime-prefetched page that
  // doesn't read `searchParams` ends up varying on the entire query string and
  // can't share a cached segment. Re-enable once vary-param tracking moves to
  // per-param keys. The spec-driven `.then` probe will then resolve to the same
  // (undefined) value across these URLs and the cache entry will be reused.
  it.skip('shares cached segment across search params when not accessed (runtime prefetch)', async () => {
    // Runtime prefetch page that does NOT access searchParams. Since '?'
    // is not in varyParams, different search param values share the cache.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/runtime-prefetch-search-params', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // First prefetch fetches the segment
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-search-params/target-page?q=1"]'
        )
        await toggle.click()
      },
      { includes: 'Static content - searchParams not accessed' }
    )

    // Different search param values are cache hits
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch-search-params/target-page?q=2"]'
      )
      await toggle.click()
    }, 'no-requests')

    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/runtime-prefetch-search-params/target-page?q=3"]'
      )
      await toggle.click()
    }, 'no-requests')
  })

  it('tracks metadata param access separately from body (runtime prefetch)', async () => {
    // generateMetadata accesses slug, but the page body does NOT.
    // Each slug triggers a new head prefetch because metadata varies on slug.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/runtime-prefetch-metadata', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // First prefetch triggers a request including the metadata
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-metadata/aaa"]'
        )
        await toggle.click()
      },
      { includes: 'Runtime Metadata: aaa' }
    )

    // Second prefetch with different slug triggers a new request
    // (metadata varies on slug, so it can't reuse the cache)
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-metadata/bbb"]'
        )
        await toggle.click()
      },
      { includes: 'Runtime Metadata: bbb' }
    )
  })

  it('tracks vary params per-segment with layout/page split (runtime prefetch)', async () => {
    // Layout accesses both category and itemId; page accesses only category.
    // When itemId changes but category stays the same, the page segment
    // should be reused from cache (only varies on category).
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/runtime-prefetch-layout-split', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // First prefetch fetches page segment
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-layout-split/electronics/phone"]'
        )
        await toggle.click()
      },
      { includes: 'Page category:' }
    )

    // Second prefetch: same category, different itemId. The page segment is a
    // cache hit (it only varies on category), but the layout varies on itemId
    // too, so it's a genuine miss and a runtime request is required for it.
    // The page segment is not itself part of that batch — it rides along
    // because rendering a segment on the server also renders its children.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-layout-split/electronics/tablet"]'
        )
        await toggle.click()
      },
      { includes: 'Layout: electronics/tablet' }
    )

    // Different category triggers a new page segment fetch
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/runtime-prefetch-layout-split/clothing/shirt"]'
        )
        await toggle.click()
      },
      { includes: 'Page category:' }
    )

    // Navigate and verify correct content
    const link = await browser.elementByCss(
      'a[href="/runtime-prefetch-layout-split/electronics/tablet"]'
    )
    await link.click()

    const layout = await browser.elementByCss('[data-layout-content]')
    expect(await layout.text()).toContain('Layout: electronics/tablet')

    const page = await browser.elementById('runtime-prefetch-layout-split-page')
    expect(await page.text()).toContain('Page category: electronics')
  })

  it('tracks root param access via rootParams API', async () => {
    // Root params accessed via rootParams() are tracked in varyParams.
    // Different param values require separate prefetches.
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/root-params', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // First prefetch fetches content
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/aaa"]'
        )
        await toggle.click()
      },
      { includes: 'Root param page content - param: aaa' }
    )

    // Second prefetch triggers new fetch (not cached)
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/bbb"]'
        )
        await toggle.click()
      },
      { includes: 'Root param page content - param: bbb' }
    )
  })

  it('does not reuse a "use cache" segment across root param values', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/cached-root-params/en', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    expect(await browser.elementById('cached-root-param').text()).toBe(
      'Locale: en'
    )

    // Not prefetched, so the navigation fetches /de and must not reuse the
    // page segment cached for /en.
    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/cached-root-params/de"]'
      )
      await link.click()
    })

    expect(await browser.elementById('cached-root-param').text()).toBe(
      'Locale: de'
    )
  })

  // @gate ledgers
  it('tracks root params separately for sibling segments', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/scoped-root-params/es/contoso', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })

    // The page reads locale; the sidebar reads tenant. Prefetch two routes
    // so the cache has both values of each, in different combinations.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/scoped-root-params/en/acme"]'
      )
      await toggle.click()
    }, [{ includes: 'Locale: en' }, { includes: 'Tenant: acme' }])

    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/scoped-root-params/fr/globex"]'
      )
      await toggle.click()
    }, [{ includes: 'Locale: fr' }, { includes: 'Tenant: globex' }])

    // This combination hasn't been prefetched. Each segment can be reused
    // because it only depends on its own root param. Page-wide attribution
    // would make both segments vary on both params and require another fetch.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/scoped-root-params/en/globex"]'
      )
      await toggle.click()
      const link = await browser.elementByCss(
        'a[href="/scoped-root-params/en/globex"]'
      )
      await link.click()
    }, 'no-requests')

    expect(await browser.elementByCss('main').text()).toBe('Locale: en')
    expect(await browser.elementByCss('aside').text()).toBe('Tenant: globex')
  })

  // @gate ledgers
  it('tracks root params separately for metadata and the page body', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser(
      '/scoped-root-params/es/contoso/metadata',
      {
        beforePageLoad(page: Playwright.Page) {
          act = createRouterAct(page)
        },
      }
    )

    // The title reads tenant; the body reads locale. Warm both captures
    // using different combinations of the two params.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/scoped-root-params/en/acme/metadata"]'
      )
      await toggle.click()
    }, [{ includes: 'Tenant: acme' }, { includes: 'Locale: en' }])

    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/scoped-root-params/fr/globex/metadata"]'
      )
      await toggle.click()
    }, [{ includes: 'Tenant: globex' }, { includes: 'Locale: fr' }])

    // Reuse the title from the second route and the body from the first.
    // Neither capture should inherit the other one's param dependency.
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/scoped-root-params/en/globex/metadata"]'
      )
      await toggle.click()
      const link = await browser.elementByCss(
        'a[href="/scoped-root-params/en/globex/metadata"]'
      )
      await link.click()
    }, 'no-requests')

    expect(await browser.eval('document.title')).toBe('Tenant: globex')
    expect(await browser.elementByCss('main').text()).toBe('Locale: en')
  })

  // @gate ledgers
  it('keeps a dynamic page that did not read searchParams across a query-only navigation', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/navigation-reuse/query?x=1', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })
    const initialToken = await browser.elementById('server-token').text()
    expect(await browser.elementById('client-query').text()).toBe('1')

    // Reveal the links. The page's loading state is already cached from the
    // initial load, and it doesn't vary on the query.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/navigation-reuse/query?x=2"]'
        )
        .click()
      await browser
        .elementByCss(
          'input[data-link-accordion="/navigation-reuse/query?x=3"]'
        )
        .click()
    }, 'no-requests')

    // The page's output doesn't depend on the query, so the navigation keeps
    // it: no request, same server output, but the client sees the new query.
    await act(async () => {
      await browser
        .elementByCss('a[href="/navigation-reuse/query?x=2"]')
        .click()
    }, 'no-requests')
    expect(await browser.elementById('server-token').text()).toBe(initialToken)
    expect(await browser.elementById('client-query').text()).toBe('2')

    // An explicit refresh still fetches new data...
    await act(
      async () => {
        await browser.elementById('refresh').click()
      },
      { includes: 'Server token' }
    )
    const refreshedToken = await browser.elementById('server-token').text()
    expect(refreshedToken).not.toBe(initialToken)

    // ...and later query-only navigations keep the refreshed data.
    await act(async () => {
      await browser
        .elementByCss('a[href="/navigation-reuse/query?x=3"]')
        .click()
    }, 'no-requests')
    expect(await browser.elementById('server-token').text()).toBe(
      refreshedToken
    )
    expect(await browser.elementById('client-query').text()).toBe('3')
  })

  // @gate ledgers
  it('keeps a page restored from the BFCache across a query-only navigation after it was refreshed', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/navigation-reuse/query?x=1', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/navigation-reuse/query?x=2"]'
        )
        .click()
      await browser
        .elementByCss(
          'input[data-link-accordion="/navigation-reuse/query?x=3"]'
        )
        .click()
    }, 'no-requests')

    // Refresh first. The BFCache entries for this page and its head are
    // written before the refresh response arrives; they must pick up the
    // response's dependency information when it does.
    await act(
      async () => {
        await browser.elementById('refresh').click()
      },
      { includes: 'Server token' }
    )
    const refreshedToken = await browser.elementById('server-token').text()

    await act(async () => {
      await browser
        .elementByCss('a[href="/navigation-reuse/query?x=2"]')
        .click()
    }, 'no-requests')
    expect(await browser.elementById('client-query').text()).toBe('2')

    // Back to ?x=1 restores the refreshed page from the BFCache.
    await browser.back()
    await retry(async () => {
      expect(await browser.elementById('client-query').text()).toBe('1')
    })
    expect(await browser.elementById('server-token').text()).toBe(
      refreshedToken
    )

    // The restored page still knows it didn't read the query.
    await act(async () => {
      await browser
        .elementByCss('a[href="/navigation-reuse/query?x=3"]')
        .click()
    }, 'no-requests')
    expect(await browser.elementById('server-token').text()).toBe(
      refreshedToken
    )
    expect(await browser.elementById('client-query').text()).toBe('3')
  })

  // @gate ledgers
  it('keeps a dynamic layout that did not read a path param while fetching the page that did', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/navigation-reuse/layout-param/a', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })
    const layoutToken = await browser.elementById('layout-token').text()
    expect(await browser.elementById('page-id').text()).toBe('Page id: a')
    const bfcacheIdA = await browser.elementById('bfcache-id').text()

    // The loading state above [id] is already cached and doesn't vary on id.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/navigation-reuse/layout-param/b"]'
        )
        .click()
    }, 'no-requests')

    // Only the page read the param, so only the page is fetched. The layout
    // keeps its data even though it renders under a new param value.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/navigation-reuse/layout-param/b"]')
          .click()
      },
      { includes: 'Page id: b' }
    )
    expect(await browser.elementById('layout-token').text()).toBe(layoutToken)
    expect(await browser.elementById('page-id').text()).toBe('Page id: b')
    expect(await browser.elementById('client-param').text()).toBe('b')
    // A path param change is a new instance of the segment, so it gets a new
    // identity, the same way LayoutRouter remounts it.
    const bfcacheIdB = await browser.elementById('bfcache-id').text()
    expect(bfcacheIdB).not.toBe(bfcacheIdA)

    // Back/forward restores the original instance and its identity.
    await browser.back()
    await retry(async () => {
      expect(await browser.elementById('page-id').text()).toBe('Page id: a')
    })
    expect(await browser.elementById('bfcache-id').text()).toBe(bfcacheIdA)
  })

  it('still fetches the head on a query-only navigation when the metadata read searchParams', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/navigation-reuse/metadata-query?x=1', {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page)
      },
    })
    expect(await browser.eval('document.title')).toBe('Query title: 1')
    const initialToken = await browser.elementById('server-token').text()

    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/navigation-reuse/metadata-query?x=2"]'
        )
        .click()
    }, 'no-requests')

    // The head read the query, so it's fetched again.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/navigation-reuse/metadata-query?x=2"]')
          .click()
      },
      { includes: 'Query title: 2' }
    )
    expect(await browser.eval('document.title')).toBe('Query title: 2')
    if (await gate((c) => c.ledgers)) {
      // The page's own output didn't read the query, so the request was for
      // the head alone and the page is kept.
      expect(await browser.elementById('server-token').text()).toBe(
        initialToken
      )
    } else {
      // Without built-in tracking, a dynamic render reports no dependency
      // information, so the page is re-rendered along with the head.
      expect(await browser.elementById('server-token').text()).not.toBe(
        initialToken
      )
    }
  })
})
