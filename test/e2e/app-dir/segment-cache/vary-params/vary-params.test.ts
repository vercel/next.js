import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

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

  // TODO: Re-enable once vary params tracking is implemented for runtime
  // prefetch abort paths. The abort timing needs to resolve vary params before
  // the abort signal fires. See static-siblings-infrastructure branch.
  it.skip('renders cached loading state instantly with runtime prefetching', async () => {
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
})
