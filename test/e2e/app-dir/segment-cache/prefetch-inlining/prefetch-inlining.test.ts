import type * as Playwright from 'playwright'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'

// Bit values from PrefetchHint enum (const enum, so we duplicate values here)
const ParentInlinedIntoSelf = 0b100000 // 32
const InlinedIntoChild = 0b1000000 // 64
const HeadInlinedIntoSelf = 0b10000000 // 128
const HeadOutlined = 0b100000000 // 256
const PrefetchDisabled = 0b10000000000 // 1024

// The subset of the FlightRouterState tuple the assertions below read (see
// FlightRouterState in shared/lib/app-router-types.ts). The segment is
// either a plain string or a dynamic param tuple whose first element is the
// param name.
type FlightRouterStateLike = [
  segment: string | [paramName: string, ...rest: unknown[]],
  parallelRoutes: { [parallelRouterKey: string]: FlightRouterStateLike },
  refreshState?: unknown,
  refresh?: unknown,
  prefetchHints?: number,
]

function getSegmentName(node: FlightRouterStateLike): string {
  const segment = node[0]
  // Dynamic segments are param tuples; use the param name, which is what
  // the route tree is keyed by (same for every param value).
  return typeof segment === 'string' ? segment : segment[0]
}

/**
 * Renders a FlightRouterState as an ASCII tree showing inlining decisions.
 * Segments marked with "⇣ inlined" have their data included in a descendant's
 * response instead of being fetched separately. Validates that parent/child
 * hints are consistent (every InlinedIntoChild parent must have a child with
 * ParentInlinedIntoSelf, and vice versa).
 */
// "outlined ■" is the fixed-width tag (10 chars). Other tags are right-aligned
// to match.
const OUTLINED_TAG = 'outlined \u25A0'
const INLINED_TAG = '\u21E3'.padStart(OUTLINED_TAG.length)
const DYNAMIC_TAG = 'dynamic \u25FB'.padStart(OUTLINED_TAG.length)

function renderInliningTree(tree: FlightRouterStateLike): string {
  const lines: string[] = []
  const isHeadOutlined = ((tree[4] ?? 0) & HeadOutlined) !== 0
  collectNodes(tree, '', !isHeadOutlined, false, lines)
  if (isHeadOutlined) {
    // Metadata is not inlined into any page — render as a standalone sibling.
    lines.push(`${OUTLINED_TAG}  \u2514\u2500\u2500 metadata`)
  }
  return '\n' + lines.join('\n') + '\n'
}

function collectNodes(
  node: FlightRouterStateLike,
  prefix: string,
  isLast: boolean,
  hasParent: boolean,
  lines: string[],
  slotKey?: string
): void {
  const prefetchHints = node[4] ?? 0
  const prefetchDisabled = (prefetchHints & PrefetchDisabled) !== 0
  const inlinedIntoChild = (prefetchHints & InlinedIntoChild) !== 0
  const headInlined = (prefetchHints & HeadInlinedIntoSelf) !== 0

  const slotPrefix =
    slotKey !== undefined && slotKey !== 'children' ? `@${slotKey}/` : ''
  const headSuffix = headInlined ? ' (+metadata)' : ''
  const name = hasParent
    ? `${slotPrefix}"${getSegmentName(node)}"${headSuffix}`
    : 'root'
  // Static prefetch is skipped for dynamic (force-disabled) segments; they
  // are not prefetched at all. Every other segment — including ones that
  // read runtime data and may be runtime prefetched — has static data and
  // participates in inlining normally.
  const tag = prefetchDisabled
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
  const slots = node[1]
  const keys = Object.keys(slots)
  if (keys.length > 0) {
    const children = Object.values(slots)
    const childrenWithParentInlined = children.filter(
      (c) => ((c[4] ?? 0) & ParentInlinedIntoSelf) !== 0
    )
    if (inlinedIntoChild && childrenWithParentInlined.length === 0) {
      throw new Error(
        `"${getSegmentName(node)}" has InlinedIntoChild but no child has ` +
          `ParentInlinedIntoSelf`
      )
    }
    if (!inlinedIntoChild && childrenWithParentInlined.length > 0) {
      const names = childrenWithParentInlined.map(getSegmentName).join(', ')
      throw new Error(
        `"${getSegmentName(node)}" does not have InlinedIntoChild but ` +
          `child(ren) ${names} have ParentInlinedIntoSelf`
      )
    }

    const childPrefix =
      prefix + (hasParent ? (isLast ? '    ' : '\u2502   ') : '')
    const hasMultipleSlots = keys.length > 1
    for (let i = 0; i < keys.length; i++) {
      collectNodes(
        slots[keys[i]],
        childPrefix,
        i === keys.length - 1,
        true,
        lines,
        hasMultipleSlots ? keys[i] : undefined
      )
    }
  }
}

// Reads the route tree (FlightRouterState) for `pathname` from the browser
// history entry. The router syncs its state into
// `window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE` after every
// navigation (see HistoryUpdater in client/components/app-router.tsx), so we
// can assert on the tree — including the prefetch hints on each segment —
// without parsing any wire format.
//
// The navigation must be a *prefetched* client navigation: the hints ride
// the route's /_tree prefetch response (from the build manifest), and the
// router copies them into the live tree when it navigates using the
// prefetched route tree. The other ways of reaching a page don't carry the
// real hints: the tree embedded in the initial payload of a build-time
// prerendered page is generated before collectPrefetchHints runs (it's
// marked InliningHintsStale), and a non-prefetched navigation falls back to
// a dynamic request, which for a static route serves that same build-time
// payload.
async function getRouteTreeFromHistory(
  next: any,
  pathname: string,
  // The page the navigation starts from. Must have a LinkAccordion for
  // `pathname`, and must be different from `pathname` so a real client
  // navigation occurs (a same-URL navigation is special-cased as
  // a refresh).
  from: string = '/'
): Promise<FlightRouterStateLike> {
  let page: Playwright.Page
  const browser = await next.browser(from, {
    beforePageLoad(p: Playwright.Page) {
      page = p
    },
  })
  const act = createRouterAct(page!)
  // Reveal the accordion link to trigger a prefetch, and wait for all
  // resulting requests to settle, so the navigation below is guaranteed to
  // use the prefetched route tree.
  await act(async () => {
    await browser
      .elementByCss(`input[data-link-accordion="${pathname}"]`)
      .click()
  })
  // Navigate by clicking the revealed link.
  await browser.elementByCss(`a[href="${pathname}"]`).click()
  let json: string | null = null
  await retry(async () => {
    json = await browser.eval(
      `window.location.pathname === ${JSON.stringify(pathname)} &&
       window.history.state &&
       window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE
        ? JSON.stringify(
            window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE.tree
          )
        : null`
    )
    expect(json).not.toBeNull()
  })
  return JSON.parse(json!)
}

describe('prefetch inlining', () => {
  const { next, isNextDev, isNextStart, isTurbopack } = nextTestSetup({
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
    const tree = await getRouteTreeFromHistory(next, '/test-small-chain')
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
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
    const tree = await getRouteTreeFromHistory(next, '/test-outlined')
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
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
    const beforeTree = await getRouteTreeFromHistory(
      next,
      '/test-on-demand-revalidate'
    )
    expect(renderInliningTree(beforeTree)).toMatchInlineSnapshot(`
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

    const afterTree = await getRouteTreeFromHistory(
      next,
      '/test-on-demand-revalidate'
    )
    expect(renderInliningTree(afterTree)).toBe(renderInliningTree(beforeTree))
  })

  it('parallel routes: parent inlines into one slot only', async () => {
    // Layout with two parallel slots (children + @sidebar), all small. The
    // layout can only be inlined into one child — the first slot that
    // accepts (children). The @sidebar slot doesn't receive the parent's
    // data and is fetched independently.
    //
    const tree = await getRouteTreeFromHistory(next, '/test-parallel')
    if (isTurbopack) {
      // Turbopack iterates children before @sidebar, so the parent
      // inlines into children/__PAGE__.
      expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
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
      expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
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
    // Start from another page so reading the home tree involves a real
    // client navigation.
    const tree = await getRouteTreeFromHistory(next, '/', '/test-outlined')
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
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
    const tree = await getRouteTreeFromHistory(
      next,
      '/test-restart/large-middle/after'
    )
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
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
    const tree = await getRouteTreeFromHistory(next, '/test-deep/a/b/c')
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
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
    const tree = await getRouteTreeFromHistory(next, '/test-dynamic/hello')
    const helloTree = renderInliningTree(tree)

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
    const tree2 = await getRouteTreeFromHistory(next, '/test-dynamic/world')
    expect(renderInliningTree(tree2)).toBe(helloTree)

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

  if (isNextStart) {
    it('partially generated dynamic route: build hints use the most specific shell', async () => {
      const hints = await next.readJSON('.next/server/prefetch-hints.json')

      expect(hints['/test-dynamic-partial/[top]/[bottom]'])
        .toMatchInlineSnapshot(`
     {
       "hints": 64,
       "slots": {
         "children": {
           "hints": 96,
           "slots": {
             "children": {
               "hints": 32,
               "slots": {
                 "children": {
                   "hints": 64,
                   "slots": {
                     "children": {
                       "hints": 160,
                       "slots": null,
                     },
                   },
                 },
               },
             },
           },
         },
       },
     }
    `)
    })
  }

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

  it('runtime prefetch: layout inlines into a runtime-data-reading leaf; content arrives via the batched runtime prefetch', async () => {
    // Root → small static layout → page that reads cookies. The page needs a
    // runtime prefetch to resolve fully, but it still has a static response —
    // the parts of the page that don't depend on runtime data — so the build
    // inlining pass can inline the static layout into the page's bundle. The
    // whole chain collapses: root inlines into the layout, and the layout
    // inlines into the page.
    const tree = await getRouteTreeFromHistory(next, '/test-runtime-bailout')
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
              ⇣  └── "test-runtime-bailout"
     outlined ■      └── "__PAGE__" (+metadata)
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!, { includeAppShellRequests: true })

    // Reveal a default (auto) link to the route. The route is a Partial
    // Prefetching route (the page is partial), so every segment the
    // prefetch walks is held to the runtime-completeness contract — and the
    // route's static-attempt hint is unset because the page reads cookies,
    // so the walked layout deopts directly to the batched runtime shell,
    // which serves its whole subtree. The inlined layout content arrives in
    // that runtime shell response. (No static bundle request fires: the Shell
    // phase already runtime-cached every entry in the bundle chain, and a
    // runtime-complete entry is never re-fetched by a static prefetch.)
    await act(
      async () => {
        await browser
          .elementByCss(
            'input[data-prefetch="auto"]' +
              '[data-link-accordion="/test-runtime-bailout"]'
          )
          .click()
      },
      { includes: 'Static layout content', kind: 'runtime' }
    )

    // Reveal a prefetch={true} link to the same route. The shell is complete,
    // so a runtime prefetch will not give us any more data and should be skipped.
    await act(async () => {
      await browser
        .elementByCss(
          'input[data-prefetch="true"]' +
            '[data-link-accordion="/test-runtime-bailout"]'
        )
        .click()
    }, 'no-requests')

    // Navigate to the route. The prefetches fetched everything, so the
    // navigation is served entirely from the cache.
    await act(async () => {
      await browser.elementByCss('a[href="/test-runtime-bailout"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#layout-runtime-bailout').text()).toBe(
      'Static layout content'
    )
    expect(await browser.elementByCss('#page-runtime-bailout').text()).toMatch(
      /Runtime page/
    )
  })

  it('runtime passthrough: static parents inline through runtime layout to static child', async () => {
    // Root → runtime-data-reading layout → inner static layout → static
    // page. The layout reads cookies, so it needs a runtime prefetch to
    // resolve fully, but it still has a static response and participates in
    // inlining like any other segment.
    const tree = await getRouteTreeFromHistory(
      next,
      '/test-runtime-passthrough/inner'
    )
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
              ⇣  └── "test-runtime-passthrough"
              ⇣      └── "inner"
     outlined ■          └── "__PAGE__" (+metadata)
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!, { includeAppShellRequests: true })

    await act(
      async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/test-runtime-passthrough/inner"]'
          )
          .click()
      },
      // The layout reads cookies, so the route's static-attempt hint is
      // unset and the Speculative pass deopts the layout directly to the
      // batched runtime shell, which serves the whole subtree — the
      // static inner layout and page ride along in that single runtime
      // response. No static bundle request fires: every entry was already
      // runtime-cached at the shell tier by the Shell phase, and a
      // runtime-complete entry is never re-fetched by a static prefetch.
      { includes: 'Static page below runtime layout', kind: 'runtime' }
    )

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
    const tree = await getRouteTreeFromHistory(
      next,
      '/test-instant-false-passthrough/inner'
    )
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
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
    const tree = await getRouteTreeFromHistory(
      next,
      '/test-runtime-parallel/inner'
    )
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
              ⇣  └── "test-runtime-parallel"
              ⇣      ├── "inner"
     outlined ■      │   └── "__PAGE__" (+metadata)
     outlined ■      └── @sidebar/"__DEFAULT__"
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!, { includeAppShellRequests: true })

    await act(
      async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/test-runtime-parallel/inner"]'
          )
          .click()
      },
      // Same as the runtime passthrough test: the hint-unset layout deopts
      // to the batched runtime shell, which serves the whole subtree
      // (both slots) in a single runtime response.
      { includes: 'Runtime parallel main content', kind: 'runtime' }
    )

    await act(async () => {
      await browser
        .elementByCss('a[href="/test-runtime-parallel/inner"]')
        .click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-runtime-parallel').text()).toBe(
      'Runtime parallel main content'
    )
  })

  it('independent head: param-dependent head rides along with the runtime prefetch', async () => {
    // The layout at /test-independent-head/[item] reads cookies. The pages
    // underneath it are static. The metadata (head) accesses both the
    // [item] param and searchParams, making it depend on runtime data.
    //
    // Because the layout reads cookies, the route's static-attempt hint is
    // unset, so on this Partial Prefetching route every shell and prefetch
    // deopt its new subtree to a runtime request. The head is
    // param-dependent, so it is NOT part of the reusable App Shell — but
    // whenever a runtime prefetch fires for a segment, the head rides
    // along in the same request. So each prefetched sibling gets its own
    // param-specific head ahead of the navigation, without a standalone
    // head request.
    const tree = await getRouteTreeFromHistory(next, '/test-independent-head/a')
    expect(renderInliningTree(tree)).toMatchInlineSnapshot(`
     "
              ⇣  root
              ⇣  └── "test-independent-head"
              ⇣      └── "item"
     outlined ■          └── "__PAGE__" (+metadata)
     "
    `)

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!, { includeAppShellRequests: true })

    // Runtime-prefetch (with prefetch={true}) route A. This caches the layout, the
    // static page, and A's head.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/test-independent-head/a"]')
        .click()
    }, [
      // Shell
      { includes: 'item-layout', kind: 'runtime' },
      // Speculative (search params)
      { includes: 'Independent Head Title: a', kind: 'runtime' },
    ])
    // Navigate to A. It should be fully prefetched.
    await act(async () => {
      await browser.elementByCss('a[href="/test-independent-head/a"]').click()
    }, 'no-requests')

    // Now we're on route A. Reveal the sibling link to route B (with prefetch={true}).
    // The layout is shared between A and B, so it's already cached and won't
    // be re-fetched. The only new segment is the [item] page. On this
    // hint-unset route it deopts to the batched runtime prefetch, and B's
    // param-specific head rides along in the same request — no standalone
    // head request is spawned.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/test-independent-head/b"]')
        .click()
    }, [
      // The page and the head arrive in the same runtime response.
      { includes: 'Independent Head Title: b', kind: 'runtime' },
    ])

    // Navigate to route B. Everything, including the param-dependent head,
    // was prefetched, so the navigation is served entirely from the cache.
    await act(async () => {
      await browser.elementByCss('a[href="/test-independent-head/b"]').click()
    }, 'no-requests')

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
