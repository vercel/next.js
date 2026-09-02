import type { LoaderTree } from '../lib/app-dir-module'
import {
  PrefetchHint,
  propagateSubtreeBits,
  type PrefetchHints,
} from '../../shared/lib/app-router-types'
import type {
  FullTransportNode,
  PartialTransportNode,
} from '../../shared/lib/rsc-transport'
import {
  createSkippedSegmentData,
  segmentToTransportSegment,
} from '../../shared/lib/rsc-transport'
import type { GetDynamicParamFromSegment } from './app-render'
import { addSearchParamsIfPageSegment } from '../../shared/lib/segment'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'

export type MissingPrefetchHintPolicy =
  | 'mark-stale'
  | 'disable-prefetching'
  | 'none'

/**
 * Selects the client fallback when prefetch inlining is enabled but no hint
 * tree is available.
 */
export function getMissingPrefetchHintPolicy(
  isBuildTimePrerendering: boolean,
  isPrerendering: boolean,
  cacheComponents: boolean
): MissingPrefetchHintPolicy {
  if (isBuildTimePrerendering) {
    return 'mark-stale'
  }

  if (isPrerendering || cacheComponents) {
    // TODO(#91407): Runtime prerenders should always have hints from the
    // manifest. Until that is guaranteed, disable prefetching when they are
    // missing. Fully dynamic Cache Components routes have no manifest entry,
    // so disabling prefetching is their permanent fallback.
    return 'disable-prefetching'
  }

  return 'none'
}

/**
 * Computes the segment-local prefetch hints for a loader tree node: the
 * precomputed build-time hints unioned with the hints derived from the
 * segment's own configuration (instant/prefetch exports, loading boundary,
 * root layout position). Does not include the "subtree" bits propagated up
 * from children — the caller folds those in with propagateSubtreeBits as it
 * assembles the tree.
 *
 * Shared by createComponentTree (rendered trees) and the builders in this
 * module (structure-only trees) so the two cannot drift.
 */
export async function computeSegmentPrefetchHints(
  loaderTree: LoaderTree,
  hintTree: PrefetchHints | null,
  prefetchInliningEnabled: boolean,
  missingPrefetchHintPolicy: MissingPrefetchHintPolicy,
  partialPrefetching: boolean,
  // Whether this segment is at or above the root layout (no layout was found
  // above it).
  isRootLayoutOrAbove: boolean
): Promise<number> {
  const { layout, loading, page } = loaderTree[2]

  // Load the layout or page module to check its instant and prefetch
  // configs. When a segment doesn't export prefetch, it defaults to
  // 'partial' if the app has opted into partial prefetching globally via the
  // `partialPrefetching` config in next.config.js.
  const mod = layout ? await layout[0]() : page ? await page[0]() : undefined
  const instantConfig = mod ? (mod as AppSegmentConfig).instant : undefined
  const prefetchConfig =
    (mod ? (mod as AppSegmentConfig).prefetch : undefined) ??
    (partialPrefetching ? 'partial' : undefined)
  let prefetchHints = 0

  // Union in the precomputed build-time hints (e.g. segment inlining
  // decisions) if available. When hints are not available (e.g. dev mode or
  // if prefetch-hints.json was not generated), we fall through and still
  // compute the other hints below. In the future this should be a build
  // error, but for now we gracefully degrade.
  //
  // TODO: Move more of the hints computation (IsRootLayoutOrAbove, instant config,
  // loading boundary detection) into the build-time measurement step in
  // collectPrefetchHints, so this function only needs to union the
  // precomputed bitmask rather than re-derive hints on every render.
  if (hintTree !== null) {
    prefetchHints |= hintTree.hints
  } else if (prefetchInliningEnabled) {
    if (missingPrefetchHintPolicy === 'mark-stale') {
      // Prefetch inlining is enabled but no hint tree was provided during a
      // build-time prerender. This happens for the initial RSC payload
      // generated before collectPrefetchHints has run. Mark so the client
      // can expire the route cache entry and re-fetch the tree with correct
      // hints.
      prefetchHints |= PrefetchHint.InliningHintsStale
    } else if (missingPrefetchHintPolicy === 'disable-prefetching') {
      // At runtime with no hint tree, treat every segment as unprefetchable.
      // This covers both runtime static generation, where a manifest entry
      // should exist but may be missing, and fully dynamic Cache Components
      // routes, which never have a manifest entry. Do NOT set
      // InliningHintsStale because the latter would enter an infinite
      // re-fetch loop trying to get hints that will never exist.
      prefetchHints |= PrefetchHint.PrefetchDisabled
    } else {
      // Dynamic pages without Cache Components have no static shell, so hints
      // are never computed. Don't disable prefetching — just skip the inlining
      // hint system and let prefetching proceed normally.
    }
  }

  // Mark every segment at or above the root layout.
  if (isRootLayoutOrAbove) {
    prefetchHints |= PrefetchHint.IsRootLayoutOrAbove
  }

  if (instantConfig === false) {
    // The segment explicitly opts out of Partial Prefetching. We don't change
    // the prefetch behavior, but we record it so the dev-time
    // `<Link prefetch={true}>` warning can be suppressed for this route.
    prefetchHints |= PrefetchHint.SubtreeHasInstantFalse
  }

  if (prefetchConfig === 'partial') {
    prefetchHints |= PrefetchHint.SubtreeHasPartialPrefetching
  } else if (prefetchConfig === 'force-disabled') {
    prefetchHints |= PrefetchHint.PrefetchDisabled
  }

  // Check if this segment has a loading boundary
  if (loading) {
    prefetchHints |= PrefetchHint.SegmentHasLoadingBoundary
  }

  return prefetchHints
}

/**
 * Builds a transport tree with no render output directly from the loader
 * tree: each node carries its segment identity and prefetch hints. Rendered
 * trees are produced by createComponentTree instead; this module covers the
 * responses (and subtrees) where nothing is rendered — router-state-only
 * responses, route tree prefetches, the structure beneath a loading-boundary
 * cut in a non-PPR prefetch, and error payloads.
 */
async function createTransportTreeFromLoaderTreeImpl(
  loaderTree: LoaderTree,
  // What to emit for each position: nothing (the client fetches it lazily;
  // false) or skipped data (true). Full trees require the latter — see
  // createFullTransportTreeFromLoaderTree.
  emitSkippedData: boolean,
  hintTree: PrefetchHints | null,
  prefetchInliningEnabled: boolean,
  missingPrefetchHintPolicy: MissingPrefetchHintPolicy,
  partialPrefetching: boolean,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any,
  didFindRootLayout: boolean
): Promise<PartialTransportNode> {
  const [segment, parallelRoutes, { layout }] = loaderTree
  const dynamicParam = getDynamicParamFromSegment(loaderTree)
  const treeSegment = dynamicParam ? dynamicParam.treeSegment : segment

  let prefetchHints = await computeSegmentPrefetchHints(
    loaderTree,
    hintTree,
    prefetchInliningEnabled,
    missingPrefetchHintPolicy,
    partialPrefetching,
    !didFindRootLayout
  )

  if (!didFindRootLayout && typeof layout !== 'undefined') {
    // This segment is the root layout; its descendants are below it.
    didFindRootLayout = true
  }

  let children: Map<string, PartialTransportNode> | undefined
  for (const parallelRouteKey in parallelRoutes) {
    // Look up the child hint node by parallel route key, traversing the
    // hint tree in parallel with the loader tree.
    const childHintNode = hintTree?.slots?.[parallelRouteKey] ?? null

    const child = await createTransportTreeFromLoaderTreeImpl(
      parallelRoutes[parallelRouteKey],
      emitSkippedData,
      childHintNode,
      prefetchInliningEnabled,
      missingPrefetchHintPolicy,
      partialPrefetching,
      getDynamicParamFromSegment,
      searchParams,
      didFindRootLayout
    )
    // Propagate subtree flags from children
    if (child.h !== undefined) {
      prefetchHints = propagateSubtreeBits(prefetchHints, child.h)
    }
    if (children === undefined) {
      children = new Map()
    }
    children.set(parallelRouteKey, child)
  }

  const node: PartialTransportNode = {
    s: segmentToTransportSegment(
      addSearchParamsIfPageSegment(treeSegment, searchParams)
    ),
  }
  if (prefetchHints !== 0) {
    node.h = prefetchHints
  }
  if (emitSkippedData) {
    node.d = createSkippedSegmentData()
  }
  if (children !== undefined) {
    node.c = children
  }
  return node
}

/**
 * Builds a structure-only transport tree from the loader tree: identity and
 * hints, no render output on any node. Used for router-state-only responses
 * and for the structure beneath a loading-boundary cut in a non-PPR
 * prefetch, where the client fetches the content lazily.
 */
export async function createTransportTreeFromLoaderTree(
  loaderTree: LoaderTree,
  hintTree: PrefetchHints | null,
  prefetchInliningEnabled: boolean,
  missingPrefetchHintPolicy: MissingPrefetchHintPolicy,
  partialPrefetching: boolean,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any,
  // Whether a root layout was already found above this loader tree slice, so a
  // slice that starts below the root layout doesn't mark a sub-layout as the
  // root layout.
  didFindRootLayout: boolean = false
): Promise<PartialTransportNode> {
  return createTransportTreeFromLoaderTreeImpl(
    loaderTree,
    false,
    hintTree,
    prefetchInliningEnabled,
    missingPrefetchHintPolicy,
    partialPrefetching,
    getDynamicParamFromSegment,
    searchParams,
    didFindRootLayout
  )
}

/**
 * Builds a full transport tree from the loader tree where every position is
 * skipped. Used for error payloads, which don't render the route: the caller
 * attaches the error shell to the root node's data.
 */
export async function createFullTransportTreeFromLoaderTree(
  loaderTree: LoaderTree,
  hintTree: PrefetchHints | null,
  prefetchInliningEnabled: boolean,
  missingPrefetchHintPolicy: MissingPrefetchHintPolicy,
  partialPrefetching: boolean,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any
): Promise<FullTransportNode> {
  // With emitSkippedData, every node carries data, which is what
  // FullTransportNode requires. TypeScript can't see through the flag,
  // hence the cast.
  return createTransportTreeFromLoaderTreeImpl(
    loaderTree,
    true,
    hintTree,
    prefetchInliningEnabled,
    missingPrefetchHintPolicy,
    partialPrefetching,
    getDynamicParamFromSegment,
    searchParams,
    false
  ) as Promise<FullTransportNode>
}

/**
 * Builds the transport tree for a route tree prefetch response. Router state
 * only — no render output.
 */
export async function createRouteTreePrefetch(
  loaderTree: LoaderTree,
  hintTree: PrefetchHints | null,
  prefetchInliningEnabled: boolean,
  missingPrefetchHintPolicy: MissingPrefetchHintPolicy,
  partialPrefetching: boolean,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  // See note on createTransportTreeFromLoaderTree's didFindRootLayout.
  didFindRootLayout: boolean = false
): Promise<PartialTransportNode> {
  // Search params should not be added to page segment's cache key during a
  // route tree prefetch request, because they do not affect the structure of
  // the route. The client cache has its own logic to handle search params.
  const searchParams = {}
  return createTransportTreeFromLoaderTreeImpl(
    loaderTree,
    false,
    hintTree,
    prefetchInliningEnabled,
    missingPrefetchHintPolicy,
    partialPrefetching,
    getDynamicParamFromSegment,
    searchParams,
    didFindRootLayout
  )
}
