import type * as Playwright from 'playwright'
import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

// Bit values from PrefetchHint enum (const enum, so we duplicate values here)
const ParentInlinedIntoSelf = 0b100000 // 32
const InlinedIntoChild = 0b1000000 // 64

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
// "outlined ■" is the fixed-width tag (10 chars). Inlined segments show just
// the arrow, right-aligned to match.
const OUTLINED_TAG = 'outlined \u25A0'
const INLINED_TAG = '\u21E3'.padStart(OUTLINED_TAG.length)

function renderInliningTree(tree: TreePrefetch): string {
  const lines: string[] = []
  collectNodes(tree, '', true, false, lines)
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
  const inlinedIntoChild = (node.prefetchHints & InlinedIntoChild) !== 0
  const _parentInlined = (node.prefetchHints & ParentInlinedIntoSelf) !== 0

  const slotPrefix =
    slotKey !== undefined && slotKey !== 'children' ? `@${slotKey}/` : ''
  const name = hasParent ? `${slotPrefix}"${node.name}"` : 'root'
  const tag = inlinedIntoChild ? INLINED_TAG : OUTLINED_TAG
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
     outlined ■      └── "__PAGE__"
     "
    `)
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
     outlined ■      └── "__PAGE__"
     "
    `)
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
       outlined ■      ├── "__PAGE__"
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
       outlined ■      │   └── "__PAGE__"
       outlined ■      └── "__PAGE__"
       "
      `)
    }
  })

  it('home: root inlines directly into page', async () => {
    // Simplest possible case: root layout + page. Root is small and inlines
    // into the page.
    const data = await fetchRouteTreePrefetch(next, '/')
    expect(renderInliningTree(data.tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
     outlined ■  └── "__PAGE__"
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
     outlined ■              └── "__PAGE__"
     "
    `)
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
     outlined ■                  └── "__PAGE__"
     "
    `)
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
     outlined ■          └── "__PAGE__"
     "
    `)

    // Different param value should produce the same hints (keyed by route
    // pattern, not concrete path)
    const data2 = await fetchRouteTreePrefetch(next, '/test-dynamic/world')
    expect(renderInliningTree(data2.tree)).toBe(helloTree)
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
})
