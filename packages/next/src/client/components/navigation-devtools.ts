import type { FlightRouterState } from '../../shared/lib/app-router-types'
import type { Params } from '../../server/request/params'
import {
  createDevToolsInstrumentedPromise,
  type InstrumentedPromise,
  type NavigationPromises,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import {
  computeSelectedLayoutSegment,
  getSelectedLayoutSegmentPath,
} from '../../shared/lib/segment'
import { ReadonlyURLSearchParams } from './readonly-url-search-params'

/**
 * Promises are cached by tree to ensure stability across suspense retries.
 */
type LayoutSegmentPromisesCache = {
  selectedLayoutSegmentPromises: Map<string, InstrumentedPromise<string | null>>
  selectedLayoutSegmentsPromises: Map<string, InstrumentedPromise<string[]>>
}

const layoutSegmentPromisesCache = new WeakMap<
  FlightRouterState,
  LayoutSegmentPromisesCache
>()

/**
 * Creates instrumented promises for layout segment hooks at a given tree level.
 * This is dev-only code for React Suspense DevTools instrumentation.
 */
export function createLayoutSegmentPromises(
  tree: FlightRouterState
): LayoutSegmentPromisesCache | null {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  // Check if we already have cached promises for this tree
  const cached = layoutSegmentPromisesCache.get(tree)
  if (cached) {
    return cached
  }

  // Create new promises and cache them
  const segmentPromises = new Map<string, InstrumentedPromise<string | null>>()
  const segmentsPromises = new Map<string, InstrumentedPromise<string[]>>()

  const parallelRoutes = tree[1]
  for (const parallelRouteKey of Object.keys(parallelRoutes)) {
    const segments = getSelectedLayoutSegmentPath(tree, parallelRouteKey)

    // Use the shared logic to compute the segment value
    const segment = computeSelectedLayoutSegment(segments, parallelRouteKey)

    segmentPromises.set(
      parallelRouteKey,
      createDevToolsInstrumentedPromise('useSelectedLayoutSegment', segment)
    )
    segmentsPromises.set(
      parallelRouteKey,
      createDevToolsInstrumentedPromise('useSelectedLayoutSegments', segments)
    )
  }

  const result: LayoutSegmentPromisesCache = {
    selectedLayoutSegmentPromises: segmentPromises,
    selectedLayoutSegmentsPromises: segmentsPromises,
  }

  // Cache the result for future renders
  layoutSegmentPromisesCache.set(tree, result)

  return result
}

const rootNavigationPromisesCache = new WeakMap<
  FlightRouterState,
  Map<string, NavigationPromises>
>()

/**
 * Creates instrumented navigation promises for the root app-router.
 */
export function createRootNavigationPromises(
  tree: FlightRouterState,
  pathname: string,
  searchParams: URLSearchParams,
  pathParams: Params
): NavigationPromises | null {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  // Create stable cache keys from the values
  const searchParamsString = searchParams.toString()
  const pathParamsString = JSON.stringify(pathParams)
  const cacheKey = `${pathname}:${searchParamsString}:${pathParamsString}`

  // Get or create the cache for this tree
  let treeCache = rootNavigationPromisesCache.get(tree)
  if (!treeCache) {
    treeCache = new Map<string, NavigationPromises>()
    rootNavigationPromisesCache.set(tree, treeCache)
  }

  // Check if we have cached promises for this combination
  const cached = treeCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const readonlySearchParams = new ReadonlyURLSearchParams(searchParams)

  const layoutSegmentPromises = createLayoutSegmentPromises(tree)

  const promises: NavigationPromises = {
    pathname: createDevToolsInstrumentedPromise('usePathname', pathname),
    searchParams: createDevToolsInstrumentedPromise(
      'useSearchParams',
      readonlySearchParams
    ),
    params: createDevToolsInstrumentedPromise('useParams', pathParams),
    ...layoutSegmentPromises,
  }

  treeCache.set(cacheKey, promises)

  return promises
}

const nestedLayoutPromisesCache = new WeakMap<
  FlightRouterState,
  Map<NavigationPromises | null, NavigationPromises>
>()

/**
 * Creates merged navigation promises for nested layouts.
 * Merges parent promises with layout-specific segment promises.
 */
export function createNestedLayoutNavigationPromises(
  tree: FlightRouterState,
  parentNavPromises: NavigationPromises | null
): NavigationPromises | null {
  if (process.env.NODE_ENV === 'production') {
    return null
  }

  const parallelRoutes = tree[1]
  const parallelRouteKeys = Object.keys(parallelRoutes)

  // Only create promises if there are parallel routes at this level
  if (parallelRouteKeys.length === 0) {
    return null
  }

  // Get or create the cache for this tree
  let treeCache = nestedLayoutPromisesCache.get(tree)
  if (!treeCache) {
    treeCache = new Map<NavigationPromises | null, NavigationPromises>()
    nestedLayoutPromisesCache.set(tree, treeCache)
  }

  // Check if we have cached promises for this parent combination
  const cached = treeCache.get(parentNavPromises)
  if (cached) {
    return cached
  }

  // Create merged promises
  const layoutSegmentPromises = createLayoutSegmentPromises(tree)
  const promises: NavigationPromises = {
    ...parentNavPromises!,
    ...layoutSegmentPromises,
  }

  treeCache.set(parentNavPromises, promises)

  return promises
}
