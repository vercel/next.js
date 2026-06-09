import type { LoaderTree } from '../lib/app-dir-module'
import {
  PrefetchHint,
  propagateSubtreeBits,
  type FlightRouterState,
  type PrefetchHints,
} from '../../shared/lib/app-router-types'
import type { GetDynamicParamFromSegment } from './app-render'
import { addSearchParamsIfPageSegment } from '../../shared/lib/segment'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'

async function createFlightRouterStateFromLoaderTreeImpl(
  loaderTree: LoaderTree,
  hintTree: PrefetchHints | null,
  prefetchInliningEnabled: boolean,
  cacheComponents: boolean,
  partialPrefetching: boolean | 'unstable_eager' | undefined,
  isStaticGeneration: boolean,
  isBuildTimePrerendering: boolean,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any,
  didFindRootLayout: boolean
): Promise<FlightRouterState> {
  const [segment, parallelRoutes, { layout, loading, page }] = loaderTree
  const dynamicParam = getDynamicParamFromSegment(loaderTree)
  const treeSegment = dynamicParam ? dynamicParam.treeSegment : segment

  const segmentTree: FlightRouterState = [
    addSearchParamsIfPageSegment(treeSegment, searchParams),
    {},
  ]

  // Load the layout or page module to check its unstable_instant and prefetch
  // configs. When a segment doesn't export prefetch, it defaults to
  // 'partial' if the app has opted into partial prefetching globally via the
  // `partialPrefetching` config in next.config.js.
  const mod = layout ? await layout[0]() : page ? await page[0]() : undefined
  const instantConfig = mod
    ? (mod as AppSegmentConfig).unstable_instant
    : undefined
  const prefetchConfig =
    (mod ? (mod as AppSegmentConfig).prefetch : undefined) ??
    (partialPrefetching === 'unstable_eager'
      ? 'unstable_eager'
      : partialPrefetching
        ? 'partial'
        : undefined)
  let prefetchHints = 0

  // Union in the precomputed build-time hints (e.g. segment inlining
  // decisions) if available. When hints are not available (e.g. dev mode or
  // if prefetch-hints.json was not generated), we fall through and still
  // compute the other hints below. In the future this should be a build
  // error, but for now we gracefully degrade.
  //
  // TODO: Move more of the hints computation (IsRootLayout, instant config,
  // loading boundary detection) into the build-time measurement step in
  // collectPrefetchHints, so this function only needs to union the
  // precomputed bitmask rather than re-derive hints on every render.
  if (hintTree !== null) {
    prefetchHints |= hintTree.hints
  } else if (prefetchInliningEnabled) {
    if (isBuildTimePrerendering) {
      // Prefetch inlining is enabled but no hint tree was provided during a
      // build-time prerender. This happens for the initial RSC payload
      // generated before collectPrefetchHints has run. Mark so the client
      // can expire the route cache entry and re-fetch the tree with correct
      // hints.
      prefetchHints |= PrefetchHint.InliningHintsStale
    } else if (isStaticGeneration) {
      // TODO(#91407): Temporary mitigation: when hints are missing during
      // runtime static generation, fall back to treating every segment as
      // unprefetchable. This currently happens for routes with
      // `instant = false` at the root segment, which causes the prerender
      // to run per-request instead of being cached, and the prefetch hints
      // manifest is not available.
      //
      // Once that bug is fixed, this branch should become an error again —
      // hints should always be available from the manifest during ISR.
      prefetchHints |= PrefetchHint.PrefetchDisabled
    } else if (cacheComponents) {
      // At runtime with no hint tree, this is a fully dynamic route with no
      // manifest entry. Treat every segment as unprefetchable. Do NOT set
      // InliningHintsStale — that would cause the client to enter an
      // infinite re-fetch loop trying to get hints that will never exist.
      prefetchHints |= PrefetchHint.PrefetchDisabled
    } else {
      // Without cacheComponents, dynamic pages have no static shell so
      // hints are never computed. Don't disable prefetching — just skip
      // the inlining hint system and let prefetching proceed normally.
    }
  }

  // Mark the first segment that has a layout as the "root" layout
  if (!didFindRootLayout && typeof layout !== 'undefined') {
    didFindRootLayout = true
    prefetchHints |= PrefetchHint.IsRootLayout
  }

  const isInstant =
    instantConfig === true ||
    (typeof instantConfig === 'object' && instantConfig !== null)
  if (isInstant) {
    prefetchHints |= PrefetchHint.SubtreeHasPartialPrefetching
  }

  if (prefetchConfig === 'partial') {
    prefetchHints |= PrefetchHint.SubtreeHasPartialPrefetching
  } else if (prefetchConfig === 'unstable_eager') {
    // Like 'partial' (uses the PPR fetch strategy) but also marks the segment
    // as eager, so App Shells keeps prefetching it instead of relying on the
    // shared app shell.
    prefetchHints |=
      PrefetchHint.SubtreeHasPartialPrefetching |
      PrefetchHint.SubtreeHasEagerPrefetch
  } else if (prefetchConfig === 'force-disabled') {
    prefetchHints |= PrefetchHint.PrefetchDisabled
  } else if (prefetchConfig === 'allow-runtime') {
    prefetchHints |= PrefetchHint.HasRuntimePrefetch
  }

  // Mark the segment as "eager" unless its effective prefetch strategy is
  // 'partial' or 'allow-runtime'. A truthy unstable_instant is treated as
  // 'partial' (not eager). 'unstable_eager' already set the bit above. Under
  // App Shells, a subtree with no eager segment skips its Speculative prefetch
  // and relies on the shared app shell instead.
  if (
    !isInstant &&
    prefetchConfig !== 'partial' &&
    prefetchConfig !== 'allow-runtime'
  ) {
    prefetchHints |= PrefetchHint.SubtreeHasEagerPrefetch
  }

  // Check if this segment has a loading boundary
  if (loading) {
    prefetchHints |= PrefetchHint.SegmentHasLoadingBoundary
  }

  const children: FlightRouterState[1] = {}
  for (const parallelRouteKey in parallelRoutes) {
    // Look up the child hint node by parallel route key, traversing the
    // hint tree in parallel with the loader tree.
    const childHintNode = hintTree?.slots?.[parallelRouteKey] ?? null

    const child = await createFlightRouterStateFromLoaderTreeImpl(
      parallelRoutes[parallelRouteKey],
      childHintNode,
      prefetchInliningEnabled,
      cacheComponents,
      partialPrefetching,
      isStaticGeneration,
      isBuildTimePrerendering,
      getDynamicParamFromSegment,
      searchParams,
      didFindRootLayout
    )
    // Propagate subtree flags from children
    if (child[4] !== undefined) {
      prefetchHints = propagateSubtreeBits(prefetchHints, child[4])
    }
    children[parallelRouteKey] = child
  }
  segmentTree[1] = children

  if (prefetchHints !== 0) {
    segmentTree[4] = prefetchHints
  }

  return segmentTree
}

export async function createFlightRouterStateFromLoaderTree(
  loaderTree: LoaderTree,
  hintTree: PrefetchHints | null,
  prefetchInliningEnabled: boolean,
  cacheComponents: boolean,
  partialPrefetching: boolean | 'unstable_eager' | undefined,
  isStaticGeneration: boolean,
  isBuildTimePrerendering: boolean,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any
): Promise<FlightRouterState> {
  const didFindRootLayout = false
  return createFlightRouterStateFromLoaderTreeImpl(
    loaderTree,
    hintTree,
    prefetchInliningEnabled,
    cacheComponents,
    partialPrefetching,
    isStaticGeneration,
    isBuildTimePrerendering,
    getDynamicParamFromSegment,
    searchParams,
    didFindRootLayout
  )
}

export async function createRouteTreePrefetch(
  loaderTree: LoaderTree,
  hintTree: PrefetchHints | null,
  prefetchInliningEnabled: boolean,
  cacheComponents: boolean,
  partialPrefetching: boolean | 'unstable_eager' | undefined,
  isStaticGeneration: boolean,
  isBuildTimePrerendering: boolean,
  getDynamicParamFromSegment: GetDynamicParamFromSegment
): Promise<FlightRouterState> {
  // Search params should not be added to page segment's cache key during a
  // route tree prefetch request, because they do not affect the structure of
  // the route. The client cache has its own logic to handle search params.
  const searchParams = {}
  const didFindRootLayout = false
  return createFlightRouterStateFromLoaderTreeImpl(
    loaderTree,
    hintTree,
    prefetchInliningEnabled,
    cacheComponents,
    partialPrefetching,
    isStaticGeneration,
    isBuildTimePrerendering,
    getDynamicParamFromSegment,
    searchParams,
    didFindRootLayout
  )
}
