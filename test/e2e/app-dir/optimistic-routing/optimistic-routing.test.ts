/**
 * Optimistic Routing Tests
 *
 * These tests verify that route prediction works correctly. The key behavior
 * being tested is that after learning a route pattern from one URL, navigating
 * to a different URL with the same pattern should show the loading state
 * instantly - without waiting for a tree prefetch.
 *
 * The testing strategy uses the fact that loading boundaries are cached and
 * can be reused across different param values. If route prediction works:
 * 1. We predict the route structure without a tree prefetch
 * 2. We know there's a loading boundary from the predicted structure
 * 3. The loading boundary segment is already cached
 * 4. The loading UI appears instantly with the new param value
 *
 * We use RouterAct and assert on the loading state inside the act scope,
 * where network responses haven't reached the client yet.
 */

import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('optimistic-routing', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Route prediction with static siblings requires production build
    // because dev mode uses on-demand compilation (staticChildren is null)
    test('skipped in dev mode', () => {})
    return
  }

  it('basic dynamic route prediction: shows loading state instantly for unprefetched route', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Step 1: Reveal and prefetch the first blog post link.
    // This learns the /blog/[slug] route pattern and caches the loading boundary.
    const revealPost1 = await browser.elementByCss(
      'input[data-link-accordion="/blog/post-1"]'
    )
    await act(
      async () => {
        await revealPost1.click()
      },
      {
        // Wait for prefetch to complete by matching loading boundary text in response
        includes: 'Loading',
      }
    )

    // Step 2: Reveal the second link and navigate to it.
    // This link has prefetch={false} to test route prediction - we want to
    // confirm the loading state appears instantly WITHOUT any prefetch.
    await act(async () => {
      const revealPost2 = await browser.elementByCss(
        'input[data-link-accordion="/blog/post-2"]'
      )
      await revealPost2.click()
    }, 'no-requests') // Assert: prefetch={false} means no requests on reveal

    const linkPost2 = await browser.elementByCss('a[href="/blog/post-2"]')
    await act(async () => {
      await linkPost2.click()

      // Assert inside the act scope - at this point, network responses haven't
      // reached the client yet. If the loading state is visible, it proves
      // route prediction worked.
      const loadingMessage = await browser.elementById('loading-message')
      expect(await loadingMessage.text()).toBe('Loading post-2...')
    })

    // Step 3: After act completes, verify the full page eventually loads
    const postTitle = await browser.elementById('post-title')
    expect(await postTitle.text()).toBe('Blog Post: post-2')
  })

  it('nested dynamic routes: predicts through multiple dynamic segments', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Step 1: Reveal and prefetch the first product link.
    // This learns the /products/[category]/[id] route pattern.
    const revealProduct1 = await browser.elementByCss(
      'input[data-link-accordion="/products/electronics/phone-1"]'
    )
    await act(
      async () => {
        await revealProduct1.click()
      },
      {
        includes: 'Loading',
      }
    )

    // Step 2: Navigate to a different product with different category AND id.
    // This link has prefetch={false} to test route prediction - we want to
    // confirm the loading state appears instantly WITHOUT any prefetch.
    await act(async () => {
      const revealProduct2 = await browser.elementByCss(
        'input[data-link-accordion="/products/clothing/shirt-1"]'
      )
      await revealProduct2.click()
    }, 'no-requests') // Assert: prefetch={false} means no requests on reveal

    const linkProduct2 = await browser.elementByCss(
      'a[href="/products/clothing/shirt-1"]'
    )
    await act(async () => {
      await linkProduct2.click()

      // Both category and id should be predicted correctly
      const loadingMessage = await browser.elementById('loading-message')
      expect(await loadingMessage.text()).toBe('Loading clothing/shirt-1...')
    })

    // Verify final page content
    const productTitle = await browser.elementById('product-title')
    expect(await productTitle.text()).toBe('Product: clothing/shirt-1')
  })

  it('optional catch-all: predicts from index to path with segments', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Step 1: Prefetch /docs (index route, no slug segments)
    const revealDocsIndex = await browser.elementByCss(
      'input[data-link-accordion="/docs"]'
    )
    await act(
      async () => {
        await revealDocsIndex.click()
      },
      {
        includes: 'Loading',
      }
    )

    // Step 2: Navigate to /docs/intro (one segment)
    const revealDocsIntro = await browser.elementByCss(
      'input[data-link-accordion="/docs/intro"]'
    )
    await revealDocsIntro.click()

    const linkDocsIntro = await browser.elementByCss('a[href="/docs/intro"]')
    await act(async () => {
      await linkDocsIntro.click()

      const loadingMessage = await browser.elementById('loading-message')
      expect(await loadingMessage.text()).toBe('Loading docs intro...')
    })

    const docsTitle = await browser.elementById('docs-title')
    expect(await docsTitle.text()).toBe('Docs: intro')
  })

  it('optional catch-all: predicts between paths with different segment counts', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Step 1: Prefetch /docs/intro (one segment)
    const revealDocsIntro = await browser.elementByCss(
      'input[data-link-accordion="/docs/intro"]'
    )
    await act(
      async () => {
        await revealDocsIntro.click()
      },
      {
        includes: 'Loading',
      }
    )

    // Step 2: Navigate to /docs/guide/getting-started (two segments).
    // This link has prefetch={false} to test route prediction - we want to
    // confirm the loading state appears instantly WITHOUT any prefetch.
    await act(async () => {
      const revealDocsGuide = await browser.elementByCss(
        'input[data-link-accordion="/docs/guide/getting-started"]'
      )
      await revealDocsGuide.click()
    }, 'no-requests') // Assert: prefetch={false} means no requests on reveal

    const linkDocsGuide = await browser.elementByCss(
      'a[href="/docs/guide/getting-started"]'
    )
    await act(async () => {
      await linkDocsGuide.click()

      const loadingMessage = await browser.elementById('loading-message')
      expect(await loadingMessage.text()).toBe(
        'Loading docs guide/getting-started...'
      )
    })

    const docsTitle = await browser.elementById('docs-title')
    expect(await docsTitle.text()).toBe('Docs: guide/getting-started')
  })

  it('required catch-all: predicts between paths with different segment counts', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Step 1: Prefetch /files/documents/report.pdf (three segments)
    const revealFiles1 = await browser.elementByCss(
      'input[data-link-accordion="/files/documents/report.pdf"]'
    )
    await act(
      async () => {
        await revealFiles1.click()
      },
      {
        includes: 'Loading',
      }
    )

    // Step 2: Navigate to /files/a/b/c/d (four segments).
    // This link has prefetch={false} to test route prediction - we want to
    // confirm the loading state appears instantly WITHOUT any prefetch.
    await act(async () => {
      const revealFiles2 = await browser.elementByCss(
        'input[data-link-accordion="/files/a/b/c/d"]'
      )
      await revealFiles2.click()
    }, 'no-requests') // Assert: prefetch={false} means no requests on reveal

    const linkFiles2 = await browser.elementByCss('a[href="/files/a/b/c/d"]')
    await act(async () => {
      await linkFiles2.click()

      const loadingMessage = await browser.elementById('loading-message')
      expect(await loadingMessage.text()).toBe('Loading file a/b/c/d...')
    })

    const filesTitle = await browser.elementById('files-title')
    expect(await filesTitle.text()).toBe('File: a/b/c/d')
  })

  it('static sibling detection: does not incorrectly match static route to dynamic pattern', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Step 1: Prefetch /blog/post-1 to learn the /blog/[slug] pattern.
    // This also learns that /blog/featured is a static sibling.
    const revealPost1 = await browser.elementByCss(
      'input[data-link-accordion="/blog/post-1"]'
    )
    await act(
      async () => {
        await revealPost1.click()
      },
      {
        includes: 'Loading',
      }
    )

    // Step 2: Navigate to /blog/featured (static sibling).
    // This link has prefetch={false} - route prediction should NOT apply because
    // /blog/featured is recognized as a static sibling of /blog/[slug].
    await act(async () => {
      const revealFeatured = await browser.elementByCss(
        'input[data-link-accordion="/blog/featured"]'
      )
      await revealFeatured.click()
    }, 'no-requests') // Assert: prefetch={false} means no requests on reveal

    const linkFeatured = await browser.elementByCss('a[href="/blog/featured"]')
    await act(async () => {
      await linkFeatured.click()

      // The loading message should NOT be visible because:
      // 1. /blog/featured is recognized as a static sibling
      // 2. Route prediction doesn't apply
      // 3. We need to wait for server response
      const loadingMessage = await browser
        .elementById('loading-message')
        .catch(() => null)
      expect(loadingMessage).toBeNull()
    })

    // After navigation completes, we should see the featured page
    const featuredTitle = await browser.elementById('featured-title')
    expect(await featuredTitle.text()).toBe('Featured Blog Post')
  })

  it('rewrite detection: detects dynamic rewrite when URL does not match route structure', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Step 1: Navigate to /rewritten/first.
    // This URL is rewritten by proxy to /actual/first.
    // Because the URL path part ("rewritten") doesn't match the route segment
    // ("actual"), the route is marked as having a dynamic rewrite.
    await act(async () => {
      const revealFirst = await browser.elementByCss(
        'input[data-link-accordion="/rewritten/first"]'
      )
      await revealFirst.click()
      const linkFirst = await browser.elementByCss('a[href="/rewritten/first"]')
      await linkFirst.click()
    })

    // Wait for navigation to complete
    await browser.elementById('actual-page')

    // Step 2: Navigate back to home using browser back button
    await browser.back()
    await browser.elementById('params-history')

    // Step 3: Navigate to /rewritten/second.
    // This link has prefetch={false}. Even though we've "learned" the route
    // from step 1, the route should be marked as having a dynamic rewrite,
    // so we should NOT use the cached pattern.
    await act(async () => {
      const revealSecond = await browser.elementByCss(
        'input[data-link-accordion="/rewritten/second"]'
      )
      await revealSecond.click()
    }, 'no-requests') // Assert: prefetch={false} means no requests on reveal

    const linkSecond = await browser.elementByCss('a[href="/rewritten/second"]')
    await act(async () => {
      await linkSecond.click()
    })

    // Wait for navigation to complete
    await browser.elementById('actual-page')

    // Verify using params history that no wrong params were rendered.
    // The history accumulator captures every params change during render.
    // If route prediction incorrectly used a pattern, we'd see "first"
    // briefly flash before "second".
    const historyEl = await browser.elementById('params-history')
    const historyAttr = await historyEl.getAttribute('data-history')
    const history: string[] = JSON.parse(historyAttr)

    // The history should only contain params from actual navigations,
    // not any intermediate wrong values from incorrect prediction.
    // Expected: [{}, {slug: "first"}, {}, {slug: "second"}]
    // The {} entries are from the home page.
    const slugHistory = history
      .map((h) => JSON.parse(h))
      .filter((p) => p.slug !== undefined)
      .map((p) => p.slug)

    // We should see exactly [first, second] - no duplicates or wrong values
    expect(slugHistory).toEqual(['first', 'second'])
  })

  it('rewrite detection (search params): does not use cached pattern when search params cause different rewrite', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Step 1: Navigate to /search-rewrite?v=alpha
    // This is rewritten by proxy to /rewrite-target?content=alpha
    // The page is fully static, displaying the content param.
    await act(async () => {
      const revealAlpha = await browser.elementByCss(
        'input[data-link-accordion="/search-rewrite?v=alpha"]'
      )
      await revealAlpha.click()
      const linkAlpha = await browser.elementByCss(
        'a[href="/search-rewrite?v=alpha"]'
      )
      await linkAlpha.click()
    })

    // Wait for navigation and verify we see "alpha"
    const contentAlpha = await browser.elementById('rewrite-content')
    expect(await contentAlpha.getAttribute('data-content')).toBe('alpha')

    // Step 2: Go back to home
    await browser.back()
    await browser.elementById('params-history')

    // Step 3: Navigate to /search-rewrite?v=beta.
    // This link has prefetch={false} - if the route was incorrectly cached as
    // predictable, we'd see "alpha" instead of "beta" because the static page
    // would be served from cache.
    await act(async () => {
      const revealBeta = await browser.elementByCss(
        'input[data-link-accordion="/search-rewrite?v=beta"]'
      )
      await revealBeta.click()
    }, 'no-requests') // Assert: prefetch={false} means no requests on reveal

    const linkBeta = await browser.elementByCss(
      'a[href="/search-rewrite?v=beta"]'
    )
    await act(async () => {
      await linkBeta.click()
    })

    // Verify we see "beta", not "alpha"
    // If this shows "alpha", the route was incorrectly using a cached pattern.
    const contentBeta = await browser.elementById('rewrite-content')
    expect(await contentBeta.getAttribute('data-content')).toBe('beta')
  })
})
