import type { LoaderTree } from '../lib/app-dir-module'
import {
  PrefetchHint,
  type FlightRouterState,
  type PrefetchHints,
} from '../../shared/lib/app-router-types'
import type { GetDynamicParamFromSegment } from './app-render'
import { addSearchParamsIfPageSegment } from '../../shared/lib/segment'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'

async function createFlightRouterStateFromLoaderTreeImpl(
  loaderTree: LoaderTree,
  hintTree: PrefetchHints | null,
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

  // Load the layout or page module to check for unstable_instant config
  const mod = layout ? await layout[0]() : page ? await page[0]() : undefined
  const instantConfig = mod
    ? (mod as AppSegmentConfig).unstable_instant
    : undefined
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
  }

  // Mark the first segment that has a layout as the "root" layout
  if (!didFindRootLayout && typeof layout !== 'undefined') {
    didFindRootLayout = true
    prefetchHints |= PrefetchHint.IsRootLayout
  }

  if (instantConfig && typeof instantConfig === 'object') {
    prefetchHints |= PrefetchHint.SubtreeHasInstant
    if (instantConfig.prefetch === 'runtime') {
      prefetchHints |= PrefetchHint.HasRuntimePrefetch
    }
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
      getDynamicParamFromSegment,
      searchParams,
      didFindRootLayout
    )
    // Propagate subtree flags from children
    if (child[4] !== undefined) {
      prefetchHints |=
        child[4] &
        (PrefetchHint.SubtreeHasInstant |
          PrefetchHint.SubtreeHasLoadingBoundary)
      // If a child has a loading boundary (either directly or in its subtree),
      // propagate that as SubtreeHasLoadingBoundary to this segment.
      if (
        child[4] &
        (PrefetchHint.SegmentHasLoadingBoundary |
          PrefetchHint.SubtreeHasLoadingBoundary)
      ) {
        prefetchHints |= PrefetchHint.SubtreeHasLoadingBoundary
      }
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
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any
): Promise<FlightRouterState> {
  const didFindRootLayout = false
  return createFlightRouterStateFromLoaderTreeImpl(
    loaderTree,
    hintTree,
    getDynamicParamFromSegment,
    searchParams,
    didFindRootLayout
  )
}

export async function createRouteTreePrefetch(
  loaderTree: LoaderTree,
  hintTree: PrefetchHints | null,
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
    getDynamicParamFromSegment,
    searchParams,
    didFindRootLayout
  )
}
