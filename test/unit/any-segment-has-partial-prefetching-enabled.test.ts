import { anySegmentHasPartialPrefetchingEnabled } from 'next/dist/server/app-render/instant-validation/instant-config'
import type { LoaderTree } from 'next/dist/server/lib/app-dir-module'

// Fake `AppDirModules['page' | 'layout']` tuple: `getLayoutOrPageModule` only
// reads element 0 (the loader) and element 1 (the file path, unused here) —
// a real tuple also carries type info this test doesn't need.
function moduleTuple(exports: {
  prefetch?: 'partial' | 'auto' | 'force-disabled'
}): any {
  return [async () => exports, '/fake/module.tsx']
}

function pageTree(
  segment: string,
  exports: { prefetch?: 'partial' | 'auto' | 'force-disabled' } = {},
  parallelRoutes: LoaderTree[1] = {}
): LoaderTree {
  return [segment, parallelRoutes, { page: moduleTuple(exports) }, null]
}

function layoutTree(
  segment: string,
  exports: { prefetch?: 'partial' | 'auto' | 'force-disabled' },
  parallelRoutes: LoaderTree[1]
): LoaderTree {
  return [segment, parallelRoutes, { layout: moduleTuple(exports) }, null]
}

describe('anySegmentHasPartialPrefetchingEnabled', () => {
  it('a segment with no explicit prefetch config inherits the app-level default (on)', async () => {
    const tree = pageTree('page')
    expect(await anySegmentHasPartialPrefetchingEnabled(tree, 'partial')).toBe(
      true
    )
  })

  it('a segment with no explicit prefetch config inherits the app-level default (off)', async () => {
    const tree = pageTree('page')
    expect(await anySegmentHasPartialPrefetchingEnabled(tree, undefined)).toBe(
      false
    )
  })

  it('an explicit prefetch = "partial" enables it even when the app-level default is off', async () => {
    const tree = pageTree('page', { prefetch: 'partial' })
    expect(await anySegmentHasPartialPrefetchingEnabled(tree, undefined)).toBe(
      true
    )
  })

  it('an explicit prefetch = "force-disabled" overrides an app-level default of on, on a single-segment route', async () => {
    const tree = pageTree('page', { prefetch: 'force-disabled' })
    expect(await anySegmentHasPartialPrefetchingEnabled(tree, 'partial')).toBe(
      false
    )
  })

  // 'auto' behaves the same way as 'force-disabled' here, mirroring
  // computeSegmentPrefetchHints's identical `??` resolution
  // (create-transport-tree-from-loader-tree.ts) for the same config.
  it('an explicit prefetch = "auto" overrides an app-level default of on, on a single-segment route', async () => {
    const tree = pageTree('page', { prefetch: 'auto' })
    expect(await anySegmentHasPartialPrefetchingEnabled(tree, 'partial')).toBe(
      false
    )
  })

  // Regression test for https://github.com/vercel/next.js/issues/97386, and
  // for the exact shape of a second bug caught while fixing the first: a
  // *single-segment* tree where the one segment has an explicit override
  // does not exercise the real bug, since there's no ancestor for the
  // app-level default to trivially resolve against first. A real route is a
  // root layout (almost always unconfigured) above the actual page, and the
  // root's own inherited resolution ('partial', from the app-level default)
  // must not be treated as the final answer before the page below it -- the
  // segment that actually has an opinion -- is ever reached.
  it('a page nested under an unconfigured root layout can still override an app-level default of on', async () => {
    const tree = layoutTree(
      '',
      {},
      {
        children: pageTree('item', { prefetch: 'force-disabled' }),
      }
    )
    expect(await anySegmentHasPartialPrefetchingEnabled(tree, 'partial')).toBe(
      false
    )
  })

  // The inheritance must work in the enabling direction too: a layout's own
  // explicit opt-in should reach an unconfigured page below it, even with no
  // app-level default at all.
  it('a page nested under a layout with an explicit prefetch = "partial" inherits it', async () => {
    const tree = layoutTree(
      '',
      { prefetch: 'partial' },
      { children: pageTree('item') }
    )
    expect(await anySegmentHasPartialPrefetchingEnabled(tree, undefined)).toBe(
      true
    )
  })

  // PrefetchHint.PrefetchDisabled is documented as passive and segment-local
  // (app-router-types.ts): an opt-out on one segment's branch must not veto
  // an unrelated sibling parallel-route branch that still wants partial
  // prefetching.
  it('a "force-disabled" branch does not prevent a sibling parallel-route branch from enabling it', async () => {
    const tree = layoutTree(
      '',
      {},
      {
        children: pageTree('item', { prefetch: 'force-disabled' }),
        modal: pageTree('modal', { prefetch: 'partial' }),
      }
    )
    expect(await anySegmentHasPartialPrefetchingEnabled(tree, undefined)).toBe(
      true
    )
  })
})
