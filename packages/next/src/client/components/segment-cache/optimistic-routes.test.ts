import type { Segment } from '../../../shared/lib/app-router-types'
import type { RootRouteTree, RSCSegmentData, RouteTree } from './cache'
import { createRootRouteTree } from './cache'
import { discoverKnownRoute, matchKnownRoute } from './optimistic-routes'
import type { NormalizedSearch } from './cache-key'
import { appendLayoutVaryPath, finalizeVaryPath } from './vary-path'

/**
 * Lists the vary path's entries, nearest first. The first entry is always the
 * request key (id: null); the rest are the params the segment's cache key
 * varies on.
 */
function varyPathIds(varyPath: unknown): string[] {
  const ids: string[] = []
  let node = varyPath as
    | { id: string | number | null; parent: unknown }
    | null
    | undefined
  while (node !== null && node !== undefined) {
    ids.push(node.id === null ? 'key' : String(node.id))
    node = node.parent as typeof node
  }
  return ids
}

function makeTree(
  segment: Segment,
  requestKey: string,
  parentPartialVaryPath: any,
  slots: Map<string, RouteTree<RSCSegmentData | null>> | null = null
): RouteTree<RSCSegmentData | null> {
  const isArray = Array.isArray(segment)
  const partialVaryPath = isArray
    ? appendLayoutVaryPath(parentPartialVaryPath, segment[1], segment[0], false)
    : parentPartialVaryPath
  const varyPath = finalizeVaryPath(requestKey as any, null, partialVaryPath)
  return {
    requestKey: requestKey as any,
    segment,
    shellVaryPath: varyPath,
    refreshState: null,
    data: null,
    varyPath,
    slots,
    prefetchHints: 0,
  }
}

/**
 * The route tree of an app whose root layout is `/[locale]` with a static
 * `about/people` page and a parallel route slot `@localeSwitch/[...catchAll]`,
 * mirroring the shape in
 * https://github.com/vercel/next.js/issues/100115.
 *
 * A parallel route's node carries the synthetic `(__SLOT__)` segment, and the
 * slot's own segments live under it. The URL (`/en/about/people`) is consumed
 * by the main route, so when the walk reaches the slot's catch-all there is no
 * URL part left and the param is never resolved.
 */
function buildAppTree(
  catchAllValue: string
): RootRouteTree<RSCSegmentData | null> {
  const catchAllTree = makeTree(
    ['catchAll', catchAllValue, 'c', []] as unknown as Segment,
    '/$d$locale/@localeSwitch/$c$catchAll',
    null
  )
  const catchAllPageTree = makeTree(
    '__PAGE__',
    '/$d$locale/@localeSwitch/$c$catchAll/__PAGE__',
    null
  )
  const slotTree = makeTree(
    '(__SLOT__)',
    '/$d$locale/@localeSwitch',
    null,
    new Map([
      ['children', catchAllTree],
      ['__PAGE__', catchAllPageTree],
    ])
  )
  const peopleTree = makeTree('people', '/$d$locale/about/people', null)
  const aboutTree = makeTree(
    'about',
    '/$d$locale/about',
    null,
    new Map([['children', peopleTree]])
  )
  const localeTree = makeTree(
    ['locale', 'en', 'd', []] as unknown as Segment,
    '/$d$locale',
    null,
    new Map([
      ['children', aboutTree],
      ['localeSwitch', slotTree],
    ])
  )
  const pageTree = makeTree('__PAGE__', '/$d$locale/__PAGE__', null)

  return createRootRouteTree(localeTree, pageTree)
}

/**
 * Collects every segment in a predicted tree whose identity and cache key
 * disagree.
 *
 * A dynamic segment's vary path is the cache key its data is stored under. It
 * has to carry the segment's own param entry, because that is what lets the
 * entry be reused across param values the segment does not depend on (the
 * param is keyed as `Fallback`), and it is what makes the key the client
 * reads and the key the server's response is written under the same key.
 *
 * A segment that keeps its param tuple but drops the param entry from its
 * vary path has a key that no other code path produces: the server's response
 * is written under a key that includes the param, so the read never finds it.
 */
function findInconsistentSegments(
  tree: RouteTree<unknown>,
  found: string[] = []
): string[] {
  const segment = tree.segment
  if (Array.isArray(segment)) {
    const paramName = segment[0]
    if (!varyPathIds(tree.varyPath).includes(paramName)) {
      found.push(
        `${tree.requestKey}: segment is the '${paramName}' param, ` +
          `but its vary path is [${varyPathIds(tree.varyPath).join(', ')}]`
      )
    }
  }
  if (tree.slots !== null) {
    for (const child of tree.slots.values()) {
      findInconsistentSegments(child, found)
    }
  }
  return found
}

describe('optimistic routing reifies parallel route slot params', () => {
  it('never predicts a tree whose segment identity and cache key disagree', () => {
    const now = Date.now()

    // Learn the pattern from a server response for /en/about/people.
    discoverKnownRoute(
      now,
      '/en/about/people' as any,
      '' as NormalizedSearch,
      null,
      null,
      buildAppTree('about/people'),
      false,
      '/en/about/people',
      '' as NormalizedSearch,
      false,
      false
    )

    // Predict the same URL shape from the learned pattern.
    const matched = matchKnownRoute(
      now,
      '/en/about/people' as any,
      '' as NormalizedSearch
    )

    // A prediction is allowed to be refused (the client then resolves the
    // route on the server). What it must not do is hand back a tree whose
    // segments' identities and cache keys disagree.
    if (matched === null) {
      return
    }

    const inconsistent = findInconsistentSegments(matched.root.tree)
    expect(inconsistent).toEqual([])
  })
})
