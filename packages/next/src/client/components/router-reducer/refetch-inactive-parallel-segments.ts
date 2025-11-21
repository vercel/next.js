import type {
  FlightRouterState,
  CacheNode,
} from '../../../shared/lib/app-router-types'
import type { AppRouterState } from './router-reducer-types'
import { applyFlightData } from './apply-flight-data'
import { fetchServerResponse } from './fetch-server-response'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'

interface RefreshInactiveParallelSegments {
  navigatedAt: number
  state: AppRouterState
  updatedTree: FlightRouterState
  updatedCache: CacheNode
  includeNextUrl: boolean
  canonicalUrl: string
}

/**
 * Refreshes inactive segments that are still in the current FlightRouterState.
 * A segment is considered "inactive" when the server response indicates it didn't match to a page component.
 * This happens during a soft-navigation, where the server will want to patch in the segment
 * with the "default" component, but we explicitly ignore the server in this case
 * and keep the existing state for that segment. New data for inactive segments are inherently
 * not part of the server response when we patch the tree, because they were associated with a response
 * from an earlier navigation/request. For each segment, once it becomes "active", we encode the URL that provided
 * the data for it. This function traverses parallel routes looking for these markers so that it can re-fetch
 * and patch the new data into the tree.
 */
export async function refreshInactiveParallelSegments(
  options: RefreshInactiveParallelSegments
) {
  const fetchedSegments = new Set<string>()
  await refreshInactiveParallelSegmentsImpl({
    ...options,
    rootTree: options.updatedTree,
    fetchedSegments,
  })
}

async function refreshInactiveParallelSegmentsImpl({
  navigatedAt,
  state,
  updatedTree,
  updatedCache,
  includeNextUrl,
  fetchedSegments,
  rootTree = updatedTree,
  canonicalUrl,
}: RefreshInactiveParallelSegments & {
  fetchedSegments: Set<string>
  rootTree: FlightRouterState
}) {
  const [, parallelRoutes, refetchPath, refetchMarker] = updatedTree
  const fetchPromises = []

  if (
    refetchPath &&
    refetchPath !== canonicalUrl &&
    refetchMarker === 'refresh' &&
    // it's possible for the tree to contain multiple segments that contain data at the same URL
    // we keep track of them so we can dedupe the requests
    !fetchedSegments.has(refetchPath)
  ) {
    fetchedSegments.add(refetchPath) // Mark this URL as fetched

    // Eagerly kick off the fetch for the refetch path & the parallel routes. This should be fine to do as they each operate
    // independently on their own cache nodes, and `applyFlightData` will copy anything it doesn't care about from the existing cache.
    const fetchPromise = fetchServerResponse(
      new URL(refetchPath, location.origin),
      {
        // refetch from the root of the updated tree, otherwise it will be scoped to the current segment
        // and might not contain the data we need to patch in interception route data (such as dynamic params from a previous segment)
        flightRouterState: [rootTree[0], rootTree[1], rootTree[2], 'refetch'],
        nextUrl: includeNextUrl ? state.nextUrl : null,
      }
    ).then((result) => {
      if (typeof result !== 'string') {
        const { flightData } = result
        for (const flightDataPath of flightData) {
          // we only pass the new cache as this function is called after clearing the router cache
          // and filling in the new page data from the server. Meaning the existing cache is actually the cache that's
          // just been created & has been written to, but hasn't been "committed" yet.
          applyFlightData(
            navigatedAt,
            updatedCache,
            updatedCache,
            flightDataPath
          )
        }
      } else {
        // When result is a string, it suggests that the server response should have triggered an MPA navigation
        // I'm not 100% sure of this decision, but it seems unlikely that we'd want to introduce a redirect side effect
        // when refreshing on-screen data, so handling this has been ommitted.
      }
    })

    fetchPromises.push(fetchPromise)
  }

  for (const key in parallelRoutes) {
    const parallelFetchPromise = refreshInactiveParallelSegmentsImpl({
      navigatedAt,
      state,
      updatedTree: parallelRoutes[key],
      updatedCache,
      includeNextUrl,
      fetchedSegments,
      rootTree,
      canonicalUrl,
    })

    fetchPromises.push(parallelFetchPromise)
  }

  await Promise.all(fetchPromises)
}

/**
 * Walks the current parallel segments to determine if they are "active".
 * An active parallel route will have a `__PAGE__` segment in the FlightRouterState.
 * As opposed to a `__DEFAULT__` segment, which means there was no match for that parallel route.
 * We add a special marker here so that we know how to refresh its data when the router is revalidated.
 */
export function addRefreshMarkerToActiveParallelSegments(
  tree: FlightRouterState,
  path: string
) {
  const [segment, parallelRoutes, , refetchMarker] = tree
  // a page segment might also contain concatenated search params, so we do a partial match on the key
  if (segment.includes(PAGE_SEGMENT_KEY) && refetchMarker !== 'refresh') {
    tree[2] = path
    tree[3] = 'refresh'
  }

  for (const key in parallelRoutes) {
    addRefreshMarkerToActiveParallelSegments(parallelRoutes[key], path)
  }
}
