import type { LoaderTree } from '../lib/app-dir-module'
import {
  PrefetchHint,
  type FlightRouterState,
} from '../../shared/lib/app-router-types'
import type { GetDynamicParamFromSegment } from './app-render'
import { addSearchParamsIfPageSegment } from '../../shared/lib/segment'
import type { AppSegmentConfig } from '../../build/segment-config/app/app-segment-config'

/**
 * Synchronous fast path for when no module loading is needed (cacheComponents
 * is disabled). Avoids the overhead of async state machines, Promise.all, and
 * microtask scheduling across 500+ recursive calls. On a large app this
 * reduces cold-start createFlightRouterState from ~261ms to <5ms.
 */
function createFlightRouterStateSync(
  loaderTree: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any,
  didFindRootLayout: boolean
): FlightRouterState {
  const [segment, parallelRoutes, { layout, loading }] = loaderTree
  const dynamicParam = getDynamicParamFromSegment(loaderTree)
  const treeSegment = dynamicParam ? dynamicParam.treeSegment : segment

  const segmentTree: FlightRouterState = [
    addSearchParamsIfPageSegment(treeSegment, searchParams),
    {},
  ]

  let prefetchHints = 0

  if (!didFindRootLayout && typeof layout !== 'undefined') {
    prefetchHints |= PrefetchHint.IsRootLayout
  }

  if (loading) {
    prefetchHints |= PrefetchHint.SegmentHasLoadingBoundary
  }

  const children: FlightRouterState[1] = {}
  const didFindRootLayoutForChildren =
    didFindRootLayout || typeof layout !== 'undefined'

  for (const key in parallelRoutes) {
    const child = createFlightRouterStateSync(
      parallelRoutes[key],
      getDynamicParamFromSegment,
      searchParams,
      didFindRootLayoutForChildren
    )
    if (child[4] !== undefined) {
      prefetchHints |=
        child[4] &
        (PrefetchHint.SubtreeHasInstant |
          PrefetchHint.SubtreeHasLoadingBoundary)
      if (
        child[4] &
        (PrefetchHint.SegmentHasLoadingBoundary |
          PrefetchHint.SubtreeHasLoadingBoundary)
      ) {
        prefetchHints |= PrefetchHint.SubtreeHasLoadingBoundary
      }
    }
    children[key] = child
  }

  segmentTree[1] = children

  if (prefetchHints !== 0) {
    segmentTree[4] = prefetchHints
  }

  return segmentTree
}

/**
 * Async path for when module loading IS needed (cacheComponents is enabled).
 * Loads layout/page modules concurrently with child traversals to check for
 * unstable_instant config.
 */
async function createFlightRouterStateAsync(
  loaderTree: LoaderTree,
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

  // Load the module to check for unstable_instant config
  const modPromise = layout
    ? layout[0]()
    : page
      ? page[0]()
      : Promise.resolve(undefined)

  // Kick off module loading and all child tree traversals concurrently.
  const parallelRouteKeys = Object.keys(parallelRoutes)
  const childPromises = parallelRouteKeys.map((key) =>
    createFlightRouterStateAsync(
      parallelRoutes[key],
      getDynamicParamFromSegment,
      searchParams,
      didFindRootLayout || typeof layout !== 'undefined'
    )
  )

  // Await module and all children in parallel
  const [mod, ...childResults] = await Promise.all([
    modPromise,
    ...childPromises,
  ])

  const instantConfig = mod
    ? (mod as AppSegmentConfig).unstable_instant
    : undefined
  let prefetchHints = 0

  // Mark the first segment that has a layout as the "root" layout
  if (!didFindRootLayout && typeof layout !== 'undefined') {
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
  for (let i = 0; i < parallelRouteKeys.length; i++) {
    const child = childResults[i]
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
    children[parallelRouteKeys[i]] = child
  }
  segmentTree[1] = children

  if (prefetchHints !== 0) {
    segmentTree[4] = prefetchHints
  }

  return segmentTree
}

export function createFlightRouterStateFromLoaderTree(
  loaderTree: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any,
  cacheComponents?: boolean
): FlightRouterState | Promise<FlightRouterState> {
  const didFindRootLayout = false
  // When cacheComponents is disabled, use synchronous path — avoids async
  // overhead (Promise.all, microtask scheduling) across hundreds of recursive
  // calls. The async path is only needed to load modules for unstable_instant.
  if (!cacheComponents) {
    return createFlightRouterStateSync(
      loaderTree,
      getDynamicParamFromSegment,
      searchParams,
      didFindRootLayout
    )
  }
  return createFlightRouterStateAsync(
    loaderTree,
    getDynamicParamFromSegment,
    searchParams,
    didFindRootLayout
  )
}

export function createRouteTreePrefetch(
  loaderTree: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  cacheComponents?: boolean
): FlightRouterState | Promise<FlightRouterState> {
  // Search params should not be added to page segment's cache key during a
  // route tree prefetch request, because they do not affect the structure of
  // the route. The client cache has its own logic to handle search params.
  const searchParams = {}
  const didFindRootLayout = false
  if (!cacheComponents) {
    return createFlightRouterStateSync(
      loaderTree,
      getDynamicParamFromSegment,
      searchParams,
      didFindRootLayout
    )
  }
  return createFlightRouterStateAsync(
    loaderTree,
    getDynamicParamFromSegment,
    searchParams,
    didFindRootLayout
  )
}
