import type { LoaderTree } from '../lib/app-dir-module'
import {
  HasLoadingBoundary,
  type FlightRouterState,
} from '../../shared/lib/app-router-types'
import type { GetDynamicParamFromSegment } from './app-render'
import { addSearchParamsIfPageSegment } from '../../shared/lib/segment'

function createFlightRouterStateFromLoaderTreeImpl(
  [segment, parallelRoutes, { layout, loading }]: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any,
  includeHasLoadingBoundary: boolean,
  didFindRootLayout: boolean
): FlightRouterState {
  const dynamicParam = getDynamicParamFromSegment(segment)
  const treeSegment = dynamicParam ? dynamicParam.treeSegment : segment

  const segmentTree: FlightRouterState = [
    addSearchParamsIfPageSegment(treeSegment, searchParams),
    {},
  ]

  // Mark the first segment that has a layout as the "root" layout
  if (!didFindRootLayout && typeof layout !== 'undefined') {
    didFindRootLayout = true
    segmentTree[4] = true
  }

  let childHasLoadingBoundary = false
  const children: FlightRouterState[1] = {}
  Object.keys(parallelRoutes).forEach((parallelRouteKey) => {
    const child = createFlightRouterStateFromLoaderTreeImpl(
      parallelRoutes[parallelRouteKey],
      getDynamicParamFromSegment,
      searchParams,
      includeHasLoadingBoundary,
      didFindRootLayout
    )
    if (
      includeHasLoadingBoundary &&
      child[5] !== HasLoadingBoundary.SubtreeHasNoLoadingBoundary
    ) {
      childHasLoadingBoundary = true
    }
    children[parallelRouteKey] = child
  })
  segmentTree[1] = children

  if (includeHasLoadingBoundary) {
    // During a route tree prefetch, the FlightRouterState includes whether a
    // tree has a loading boundary. The client uses this to determine if it can
    // skip the data prefetch request — if `hasLoadingBoundary` is `false`, the
    // data prefetch response will be empty, so there's no reason to request it.
    // NOTE: It would be better to accumulate this while building the loader
    // tree so we don't have to keep re-deriving it, but since this won't be
    // once PPR is enabled everywhere, it's not that important.
    segmentTree[5] = loading
      ? HasLoadingBoundary.SegmentHasLoadingBoundary
      : childHasLoadingBoundary
        ? HasLoadingBoundary.SubtreeHasLoadingBoundary
        : HasLoadingBoundary.SubtreeHasNoLoadingBoundary
  }

  return segmentTree
}

export function createFlightRouterStateFromLoaderTree(
  loaderTree: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any
) {
  const includeHasLoadingBoundary = false
  const didFindRootLayout = false
  return createFlightRouterStateFromLoaderTreeImpl(
    loaderTree,
    getDynamicParamFromSegment,
    searchParams,
    includeHasLoadingBoundary,
    didFindRootLayout
  )
}

export function createRouteTreePrefetch(
  loaderTree: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment
): FlightRouterState {
  // Search params should not be added to page segment's cache key during a
  // route tree prefetch request, because they do not affect the structure of
  // the route. The client cache has its own logic to handle search params.
  const searchParams = {}
  // During a route tree prefetch, we include `hasLoadingBoundary` in
  // the response.
  const includeHasLoadingBoundary = true
  const didFindRootLayout = false
  return createFlightRouterStateFromLoaderTreeImpl(
    loaderTree,
    getDynamicParamFromSegment,
    searchParams,
    includeHasLoadingBoundary,
    didFindRootLayout
  )
}
