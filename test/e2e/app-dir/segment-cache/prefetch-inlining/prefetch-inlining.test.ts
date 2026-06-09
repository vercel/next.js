import type * as Playwright from 'playwright'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'

// Bit values from PrefetchHint enum (const enum, so we duplicate values here)
const HasRuntimePrefetch = 0b00001 // 1
const ParentInlinedIntoSelf = 0b100000 // 32
const InlinedIntoChild = 0b1000000 // 64
const HeadInlinedIntoSelf = 0b10000000 // 128
const HeadOutlined = 0b100000000 // 256
const PrefetchDisabled = 0b10000000000 // 1024

// Matches the shape of RootTreePrefetch / TreePrefetch from collect-segment-
// data.tsx. We only declare the fields we need.
type TreePrefetch = {
  name: string
  prefetchHints: number
  slots: null | { [key: string]: TreePrefetch }
}

type RootTreePrefetch = {
  tree: TreePrefetch
}

/**
 * Renders the TreePrefetch as an ASCII tree showing inlining decisions.
 * Segments marked with "⇣ inlined" have their data included in a descendant's
 * response instead of being fetched separately. Validates that parent/child
 * hints are consistent (every InlinedIntoChild parent must have a child with
 * ParentInlinedIntoSelf, and vice versa).
 */
// "outlined ■" is the fixed-width tag (10 chars). Other tags are right-aligned
// to match.
const OUTLINED_TAG = 'outlined \u25A0'
const INLINED_TAG = '\u21E3'.padStart(OUTLINED_TAG.length)
const RUNTIME_TAG = 'runtime \u25FB'.padStart(OUTLINED_TAG.length)
const DYNAMIC_TAG = 'dynamic \u25FB'.padStart(OUTLINED_TAG.length)

function renderInliningTree(tree: TreePrefetch): string {
  const lines: string[] = []
  const isHeadOutlined = (tree.prefetchHints & HeadOutlined) !== 0
  collectNodes(tree, '', !isHeadOutlined, false, lines)
  if (isHeadOutlined) {
    // Metadata is not inlined into any page — render as a standalone sibling.
    lines.push(`${OUTLINED_TAG}  \u2514\u2500\u2500 metadata`)
  }
  return '\n' + lines.join('\n') + '\n'
}

function collectNodes(
  node: TreePrefetch,
  prefix: string,
  isLast: boolean,
  hasParent: boolean,
  lines: string[],
  slotKey?: string
): void {
  const hasRuntimePrefetch = (node.prefetchHints & HasRuntimePrefetch) !== 0
  const prefetchDisabled = (node.prefetchHints & PrefetchDisabled) !== 0
  const inlinedIntoChild = (node.prefetchHints & InlinedIntoChild) !== 0
  const _parentInlined = (node.prefetchHints & ParentInlinedIntoSelf) !== 0
  const headInlined = (node.prefetchHints & HeadInlinedIntoSelf) !== 0

  const slotPrefix =
    slotKey !== undefined && slotKey !== 'children' ? `@${slotKey}/` : ''
  const headSuffix = headInlined ? ' (+metadata)' : ''
  const name = hasParent ? `${slotPrefix}"${node.name}"${headSuffix}` : 'root'
  // Static prefetch is skipped for runtime and dynamic segments. Distinguish
  // them in the snapshot: runtime segments will be fetched via a runtime
  // prefetch request, while dynamic segments are not prefetched at all.
  const tag = hasRuntimePrefetch
    ? RUNTIME_TAG
    : prefetchDisabled
      ? DYNAMIC_TAG
      : inlinedIntoChild
        ? INLINED_TAG
        : OUTLINED_TAG
  const connector = hasParent
    ? isLast
      ? '\u2514\u2500\u2500 '
      : '\u251C\u2500\u2500 '
    : ''
  lines.push(`${tag}  ${prefix}${connector}${name}`)

  // Validate consistency between parent and children.
  if (node.slots) {
    const children = Object.values(node.slots)
    const childrenWithParentInlined = children.filter(
      (c) => (c.prefetchHints & ParentInlinedIntoSelf) !== 0
    )
    if (inlinedIntoChild && childrenWithParentInlined.length === 0) {
      throw new Error(
        `"${node.name}" has InlinedIntoChild but no child has ParentInlinedIntoSelf`
      )
    }
    if (!inlinedIntoChild && childrenWithParentInlined.length > 0) {
      const names = childrenWithParentInlined.map((c) => c.name).join(', ')
      throw new Error(
        `"${node.name}" does not have InlinedIntoChild but child(ren) ${names} ` +
          `have ParentInlinedIntoSelf`
      )
    }

    const childPrefix =
      prefix + (hasParent ? (isLast ? '    ' : '\u2502   ') : '')
    const keys = Object.keys(node.slots)
    const hasMultipleSlots = keys.length > 1
    for (let i = 0; i < keys.length; i++) {
      collectNodes(
        node.slots[keys[i]],
        childPrefix,
        i === keys.length - 1,
        true,
        lines,
        hasMultipleSlots ? keys[i] : undefined
      )
    }
  }
}

// Temporary helper: fetches the route tree prefetch response and parses the
// RootTreePrefetch object out of it. This will be replaced by end-to-end
// tests that assert on actual client prefetch request behavior once the
// client-side changes are done.
async function fetchRouteTreePrefetch(
  next: any,
  pathname: string
): Promise<RootTreePrefetch> {
  const res = await next.fetch(pathname, {
    headers: {
      RSC: '1',
      'Next-Router-Prefetch': '1',
      'Next-Router-Segment-Prefetch': '/_tree',
    },
  })
  const text = await res.text()
  // The Flight response for a plain JSON object (no React nodes) is a single
  // line: `0:{"tree":...,"staleTime":...}`. Strip the row ID prefix and parse.
  const jsonStr = text.slice(text.indexOf(':') + 1)
  return JSON.parse(jsonStr)
}

describe('prefetch inlining', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('prefetch hints are only computed during build', () => {})
    return
  }

  it('small chain: inlines multiple ancestors into deepest child', async () => {
    // Root → child layout → page, all with minimal content (well under the
    // 2KB gzip threshold). Both the root and child layout are small enough
    // to be inlined into the page's response. The entire chain fits within
    // the 10KB total budget, so everything collapses into a single fetch
    // for the page segment.
    const data = await fetchRouteTreePrefetch(next, '/test-small-chain')
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
              ⇣  └── "test-small-chain"
     outlined ■      └── "__PAGE__" (+metadata)
     "
    `)

    // Verify client navigation works with the inlined data.
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/test-small-chain"]')
          .click()
      },
      { includes: 'Small chain page' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/test-small-chain"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-small-chain').text()).toBe(
      'Small chain page'
    )
  })

  it('outlined: large segment breaks the inlining chain', async () => {
    // Root → large layout (> 2KB gzipped) → page. The large layout exceeds
    // the per-segment inlining threshold so it can't be inlined into the
    // page. Root is still small enough for the large layout to accept, so
    // root gets inlined into the large layout's response. The page is
    // fetched separately since its parent was too large.
    const data = await fetchRouteTreePrefetch(next, '/test-outlined')
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
     outlined ■  └── "test-outlined"
     outlined ■      └── "__PAGE__" (+metadata)
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/test-outlined"]')
          .click()
      },
      { includes: 'Outlined test page' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/test-outlined"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-outlined').text()).toBe(
      'Outlined test page'
    )
  })

  it('preserves prefetch hints after on-demand revalidation', async () => {
    const beforeTree = await fetchRouteTreePrefetch(
      next,
      '/test-on-demand-revalidate'
    )
    expect(renderInliningTree(beforeTree.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
              ⇣  └── "test-on-demand-revalidate"
     outlined ■      └── "__PAGE__" (+metadata)
     "
    `)

    const before$ = await next.render$('/test-on-demand-revalidate')
    const beforeValue = before$('#page-on-demand-revalidate-value').text()
    expect(beforeValue).toMatch(/^0\.\d+$/)

    const revalidateRes = await next.fetch(
      '/api/revalidate-path?path=/test-on-demand-revalidate'
    )
    expect(revalidateRes.status).toBe(200)
    expect(await revalidateRes.json()).toEqual({
      revalidated: true,
      path: '/test-on-demand-revalidate',
    })

    await retry(
      async () => {
        const $ = await next.render$('/test-on-demand-revalidate')
        const afterValue = $('#page-on-demand-revalidate-value').text()
        expect(afterValue).toMatch(/^0\.\d+$/)
        expect(afterValue).not.toBe(beforeValue)
      },
      15000,
      1000
    )

    const afterTree = await fetchRouteTreePrefetch(
      next,
      '/test-on-demand-revalidate'
    )
    expect(renderInliningTree(afterTree.tree)).toBe(
      renderInliningTree(beforeTree.tree)
    )
  })

  it('parallel routes: parent inlines into one slot only', async () => {
    // Layout with two parallel slots (children + @sidebar), all small. The
    // layout can only be inlined into one child — the first slot that
    // accepts (children). The @sidebar slot doesn't receive the parent's
    // data and is fetched independently.
    //
    const data = await fetchRouteTreePrefetch(next, '/test-parallel')
    if (isTurbopack) {
      // Turbopack iterates children before @sidebar, so the parent
      // inlines into children/__PAGE__.
      expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
       "
                ⇣  root
                ⇣  └── "test-parallel"
       outlined ■      ├── "__PAGE__" (+metadata)
                ⇣      └── @sidebar/"(__SLOT__)"
       outlined ■          └── "__PAGE__"
       "
      `)
    } else {
      // Webpack iterates @sidebar before children, so the parent
      // inlines into @sidebar/__PAGE__ instead.
      expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
       "
                ⇣  root
                ⇣  └── "test-parallel"
                ⇣      ├── @sidebar/"(__SLOT__)"
       outlined ■      │   └── "__PAGE__" (+metadata)
       outlined ■      └── "__PAGE__"
       "
      `)
    }

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/test-parallel"]')
          .click()
      },
      { includes: 'Main content' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/test-parallel"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-parallel').text()).toBe(
      'Main content'
    )
  })

  it('home: root inlines directly into page', async () => {
    // Simplest possible case: root layout + page. Root is small and inlines
    // into the page.
    const data = await fetchRouteTreePrefetch(next, '/')
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
     outlined ■  └── "__PAGE__" (+metadata)
     "
    `)
  })

  it('restart: large segment in the middle creates two inlining groups', async () => {
    // root (small) → test-restart (small) → large-middle (> 2KB) → after
    // (small) → page (small). The large segment can't be inlined into its
    // children, splitting the tree into two inlining groups:
    // [root, test-restart] → large-middle's response, and [after] → page's
    // response.
    const data = await fetchRouteTreePrefetch(
      next,
      '/test-restart/large-middle/after'
    )
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
              ⇣  └── "test-restart"
     outlined ■      └── "large-middle"
              ⇣          └── "after"
     outlined ■              └── "__PAGE__" (+metadata)
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/test-restart/large-middle/after"]'
          )
          .click()
      },
      { includes: 'After page' }
    )

    await act(async () => {
      await browser
        .elementByCss('a[href="/test-restart/large-middle/after"]')
        .click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-restart').text()).toBe(
      'After page'
    )
  })

  it('deep chain: all small segments inline to the leaf', async () => {
    // root → test-deep → a → b → c → page, all small. Every segment in
    // the chain inlines down to the page, producing a single fetch.
    const data = await fetchRouteTreePrefetch(next, '/test-deep/a/b/c')
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
              ⇣  └── "test-deep"
              ⇣      └── "a"
              ⇣          └── "b"
              ⇣              └── "c"
     outlined ■                  └── "__PAGE__" (+metadata)
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/test-deep/a/b/c"]')
          .click()
      },
      { includes: 'Deep page' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/test-deep/a/b/c"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-deep').text()).toBe('Deep page')
  })

  it('dynamic route: hints are based on concrete params, not fallback shell', async () => {
    // The [slug] layout renders large content gated behind `await params`. In
    // the fallback shell, `await params` suspends so the segment appears small.
    // In a concrete render the full content is included, pushing it above the
    // 2KB threshold. If hints were incorrectly based on the fallback, the
    // layout would get inlined. Instead it should be outlined because the
    // concrete render is large.
    const data = await fetchRouteTreePrefetch(next, '/test-dynamic/hello')
    const helloTree = renderInliningTree(data.tree)

    expect(helloTree).toMatchInlineSnapshot(`
     "
              ⇣  root
              ⇣  └── "test-dynamic"
     outlined ■      └── "slug"
     outlined ■          └── "__PAGE__" (+metadata)
     "
    `)

    // Different param value should produce the same hints (keyed by route
    // pattern, not concrete path)
    const data2 = await fetchRouteTreePrefetch(next, '/test-dynamic/world')
    expect(renderInliningTree(data2.tree)).toBe(helloTree)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/test-dynamic/hello"]')
          .click()
      },
      { includes: 'Dynamic page: hello' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/test-dynamic/hello"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-dynamic').text()).toBe(
      'Dynamic page: hello'
    )
  })

  // TODO: Add a test for stale hints (InliningHintsStale). The stale hints
  // mechanism expires the route cache entry so the next prefetch re-fetches
  // the correct tree. This is hard to test reliably with act() because the
  // test needs to start on a page with stale hints, navigate away, and
  // navigate back — and act() can hang on CI when intercepting requests
  // that overlap with background prefetch activity. The server-side logic
  // is covered by the build output (the route tree correctly includes
  // InliningHintsStale for build-time static pages), but the client-side
  // recovery path needs a more robust test harness.

  it('instant false at root: does not prefetch segment data', async () => {
    // TODO: This test exists as a temporary mitigation for a bug where
    // routes with `instant = false` at the root segment cause the
    // prerender to run per-request instead of being cached. Until that
    // bug is fixed (see https://github.com/vercel/next.js/pull/91407),
    // we fall back to treating every segment as unprefetchable. This
    // test verifies that fallback works — the route builds successfully
    // and the client doesn't attempt to prefetch any segment data.
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    // Reveal the link to trigger a prefetch. Since all segments are
    // treated as PrefetchDisabled, the client should fetch the route
    // tree but not any segment data.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/test-instant-false-root"]')
        .click()
    })

    // The static page content should NOT appear in any prefetch response
    // because all segments are marked as unprefetchable.
    await act(
      async () => {
        await browser.elementByCss('a[href="/test-instant-false-root"]').click()
      },
      // The page content should not have been prefetched — it will be
      // fetched during navigation instead.
      { includes: 'Static page below instant:false root' }
    )
  })

  it('runtime prefetch: layout cannot inline into a runtime leaf', async () => {
    // Root → small static layout → page with runtime prefetch. Root inlines
    // into the layout (the layout accepts root's data). But the layout
    // cannot inline into the runtime page — the page is a leaf with no
    // static descendants, so there's no response to carry the layout's data.
    // The layout remains outlined while root is inlined into it.
    const data = await fetchRouteTreePrefetch(next, '/test-runtime-bailout')
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
     outlined ■  └── "test-runtime-bailout"
      runtime ◻      └── "__PAGE__" (+metadata)
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/test-runtime-bailout"]')
          .click()
      },
      { includes: 'Static layout content' }
    )

    // Navigate to the route. The static layout was prefetched (and is cached),
    // but the runtime leaf page has no static descendants and is not
    // speculatively prefetched under App Shells — it is fetched here, on
    // navigation.
    await act(async () => {
      await browser.elementByCss('a[href="/test-runtime-bailout"]').click()
    })

    expect(await browser.elementByCss('#layout-runtime-bailout').text()).toBe(
      'Static layout content'
    )
    expect(await browser.elementByCss('#page-runtime-bailout').text()).toMatch(
      /Runtime page/
    )
  })

  it('runtime passthrough: static parents inline through runtime layout to static child', async () => {
    // Root → runtime layout → inner static layout → static page. The
    // runtime layout acts as a transparent pass-through — it has a static
    // child that can accept the parent data, so the chain passes through
    // it. The runtime layout's slot in the bundle is null (no static data)
    // but it still carries InlinedIntoChild.
    const data = await fetchRouteTreePrefetch(
      next,
      '/test-runtime-passthrough/inner'
    )
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
      runtime ◻  └── "test-runtime-passthrough" (+metadata)
              ⇣      └── "inner"
     outlined ■          └── "__PAGE__"
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/test-runtime-passthrough/inner"]'
        )
        .click()
    }, [
      { includes: 'Static page below runtime layout' },
      // Appears twice: once in the static bundle and once in the
      // runtime prefetch. Static segments below a runtime layout are
      // not skipped — they participate in inlining normally because
      // sub-navigations within the runtime layout may need them. The
      // inlining thresholds ensure the duplication is worth the cost.
      { includes: 'Static page below runtime layout' },
    ])

    await act(async () => {
      await browser
        .elementByCss('a[href="/test-runtime-passthrough/inner"]')
        .click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-runtime-passthrough').text()).toBe(
      'Static page below runtime layout'
    )
  })

  it('instant false passthrough: static parents inline through dynamic layout to static child', async () => {
    // Root → dynamic layout (instant: false, uses connection()) → inner
    // static layout → static page. Same pass-through behavior as runtime
    // prefetch: the dynamic layout passes parent data through to its static
    // descendants. Its slot in the bundle is null but the chain isn't broken.
    const data = await fetchRouteTreePrefetch(
      next,
      '/test-instant-false-passthrough/inner'
    )
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
      dynamic ◻  └── "test-instant-false-passthrough"
              ⇣      └── "inner"
     outlined ■          └── "__PAGE__" (+metadata)
     "
    `)

    // Verify the dynamic layout's content is NOT included in any prefetch
    // response. The layout has instant = false, so its data should be
    // skipped entirely — fetched only during navigation.
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/test-instant-false-passthrough/inner"]'
        )
        .click()
    }, [
      // The static page below the dynamic layout IS prefetched.
      { includes: 'page-instant-false-passthrough' },
      // The dynamic layout content must NOT appear in any prefetch
      // response — it has instant = false, so it's skipped entirely.
      { includes: 'Dynamic layout', block: 'reject' },
    ])
  })

  it('runtime parallel: pass-through only flows into one child slot', async () => {
    // Root → runtime layout with two slots (children + @sidebar) → inner
    // layout → page. The runtime layout acts as a pass-through, but
    // the parent's data should only flow into one child slot (the first
    // that accepts), not both. This extends the existing parallel route
    // inlining rule to the pass-through case.
    const data = await fetchRouteTreePrefetch(
      next,
      '/test-runtime-parallel/inner'
    )
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
      runtime ◻  └── "test-runtime-parallel" (+metadata)
              ⇣      ├── "inner"
     outlined ■      │   └── "__PAGE__"
     outlined ■      └── @sidebar/"__DEFAULT__"
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(async () => {
      await browser
        .elementByCss(
          'input[data-link-accordion="/test-runtime-parallel/inner"]'
        )
        .click()
    }, [
      { includes: 'Runtime parallel main content' },
      // Appears twice: static bundle + runtime prefetch. Same as
      // runtime passthrough — static segments below a runtime layout
      // participate in inlining normally.
      { includes: 'Runtime parallel main content' },
    ])

    await act(async () => {
      await browser
        .elementByCss('a[href="/test-runtime-parallel/inner"]')
        .click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-runtime-parallel').text()).toBe(
      'Runtime parallel main content'
    )
  })

  it('independent head: metadata is prefetched even when no runtime segment request is needed', async () => {
    // The layout at /test-independent-head/[item] uses runtime prefetching
    // (reads cookies). The pages underneath it are static. The metadata
    // (head) accesses both the [item] param and searchParams, making it
    // depend on runtime data.
    //
    // When we prefetch route A, the runtime layout and head are fetched
    // together. When we then prefetch sibling route B, the layout is
    // already cached — no runtime segment request is needed. But the
    // head is different (it includes the [item] param in the title) and
    // must still be fetched via a runtime prefetch. This test verifies
    // that the head is fetched independently even when no runtime segment
    // request is spawned for the sibling.
    const data = await fetchRouteTreePrefetch(next, '/test-independent-head/a')
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
      runtime ◻  └── "test-independent-head" (+metadata)
              ⇣      └── "item"
     outlined ■          └── "__PAGE__"
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    // Prefetch and navigate to route A. This caches the runtime layout,
    // head, and static page, and makes A the current page.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/test-independent-head/a"]')
        .click()
    })
    await act(async () => {
      await browser.elementByCss('a[href="/test-independent-head/a"]').click()
    }, 'no-requests')

    // Now we're on route A. Reveal the sibling link to route B. The
    // runtime layout is shared between A and B, so it's already cached
    // and won't be re-fetched. The only new segment is the [item] page,
    // which is static, so it IS prefetched. But the head depends on the
    // [item] param (and searchParams), so it is param-dependent and is NOT
    // part of the App Shell. Under App Shells, a speculative per-link
    // prefetch does not request the param-dependent head — it is deferred
    // to navigation. So the static page is prefetched here, but the title
    // for B is not.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/test-independent-head/b"]')
        .click()
    }, [
      // The static page below the runtime layout is prefetched.
      { includes: 'page-independent-head' },
      // The param-dependent head must NOT be prefetched — it is not part
      // of the App Shell and arrives on navigation instead.
      { includes: 'Independent Head Title: b', block: 'reject' },
    ])

    // Navigate to route B. The param-dependent head was not prefetched, so
    // it is fetched now, on navigation.
    await act(
      async () => {
        await browser.elementByCss('a[href="/test-independent-head/b"]').click()
      },
      { includes: 'Independent Head Title: b' }
    )

    expect(await browser.elementByCss('#page-independent-head').text()).toBe(
      'Independent head page'
    )
  })

  it('notFound() during prerender does not crash build', async () => {
    // Regression test: a page that calls notFound() during prerendering
    // produces a flight data tree where some child seed data entries are
    // undefined. collectPrefetchHints must handle this without crashing.
    // The build succeeding is the primary assertion.
    const browser = await next.browser('/test-not-found/exists')
    expect(await browser.elementByCss('#page-not-found').text()).toBe(
      'Found: exists'
    )
  })
})
