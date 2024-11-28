import type {
  CacheNodeSeedData,
  FlightRouterState,
  FlightSegmentPath,
} from '../../../server/app-render/types'
import type {
  CacheNode,
  LoadingModuleData,
} from '../../../shared/lib/app-router-context.shared-runtime'
import type { NormalizedFlightData } from '../../flight-data-helpers'
import {
  fetchServerResponse,
  type FetchServerResponseResult,
} from '../router-reducer/fetch-server-response'
import {
  updateCacheNodeOnNavigation,
  listenForDynamicRequest,
} from '../router-reducer/ppr-navigations'
import { createHrefFromUrl as createCanonicalUrl } from '../router-reducer/create-href-from-url'
import {
  EntryStatus,
  readRouteCacheEntry,
  readSegmentCacheEntry,
  waitForSegmentCacheEntry,
} from './cache'
import type { TreePrefetch } from '../../../server/app-render/collect-segment-data'
import { createCacheKey } from './cache-key'

export const enum NavigationResultTag {
  MPA,
  Success,
  NoOp,
  Async,
}

type MPANavigationResult = {
  tag: NavigationResultTag.MPA
  data: string
}

type NoOpNavigationResult = {
  tag: NavigationResultTag.NoOp
  data: null
}

type SuccessfulNavigationResult = {
  tag: NavigationResultTag.Success
  data: {
    flightRouterState: FlightRouterState
    cacheNode: CacheNode
    canonicalUrl: string
  }
}

type AsyncNavigationResult = {
  tag: NavigationResultTag.Async
  data: Promise<
    MPANavigationResult | NoOpNavigationResult | SuccessfulNavigationResult
  >
}

export type NavigationResult =
  | MPANavigationResult
  | SuccessfulNavigationResult
  | NoOpNavigationResult
  | AsyncNavigationResult

const noOpNavigationResult: NoOpNavigationResult = {
  tag: NavigationResultTag.NoOp,
  data: null,
}

/**
 * Navigate to a new URL, using the Segment Cache to construct a response.
 *
 * To allow for synchronous navigations whenever possible, this is not an async
 * function. It returns a promise only if there's no matching prefetch in
 * the cache. Otherwise it returns an immediate result and uses Suspense/RSC to
 * stream in any missing data.
 */
export function navigate(
  url: URL,
  currentCacheNode: CacheNode,
  currentFlightRouterState: FlightRouterState,
  nextUrl: string | null
): AsyncNavigationResult | SuccessfulNavigationResult | NoOpNavigationResult {
  const now = Date.now()

  // TODO: Interception routes not yet implemented in Segment Cache. Pass a
  // Next-URL to createCacheKey.
  const cacheKey = createCacheKey(url.href, null)
  const route = readRouteCacheEntry(now, cacheKey)
  if (
    route !== null &&
    route.status === EntryStatus.Fulfilled &&
    // TODO: Prefetching interception routes is not support yet by the Segment
    // Cache. For now, treat this as a cache miss and fallthrough to a full
    // dynamic navigation.
    !route.couldBeIntercepted
  ) {
    // We have a matching prefetch.
    const snapshot = readRenderSnapshotFromCache(now, route.tree)
    const prefetchFlightRouterState = snapshot.flightRouterState
    const prefetchSeedData = snapshot.seedData
    const prefetchHead = route.head
    const canonicalUrl = route.canonicalUrl
    const promiseForDynamicServerResponse = fetchServerResponse(url, {
      flightRouterState: currentFlightRouterState,
      nextUrl,
    })
    return navigateUsingPrefetchedRouteTree(
      currentCacheNode,
      currentFlightRouterState,
      prefetchFlightRouterState,
      prefetchSeedData,
      prefetchHead,
      canonicalUrl,
      promiseForDynamicServerResponse
    )
  }
  // There's no matching prefetch for this route in the cache.
  return {
    tag: NavigationResultTag.Async,
    data: navigateDynamicallyWithNoPrefetch(
      url,
      currentCacheNode,
      currentFlightRouterState,
      nextUrl
    ),
  }
}

function navigateUsingPrefetchedRouteTree(
  currentCacheNode: CacheNode,
  currentFlightRouterState: FlightRouterState,
  prefetchFlightRouterState: FlightRouterState,
  prefetchSeedData: CacheNodeSeedData | null,
  prefetchHead: React.ReactNode | null,
  canonicalUrl: string,
  promiseForDynamicServerResponse: Promise<FetchServerResponseResult>
): SuccessfulNavigationResult | NoOpNavigationResult {
  // Recursively construct a prefetch tree by reading from the Segment Cache. To
  // maintain compatibility, we output the same data structures as the old
  // prefetching implementation: FlightRouterState and CacheNodeSeedData.
  // TODO: Eventually updateCacheNodeOnNavigation (or the equivalent) should
  // read from the Segment Cache directly. It's only structured this way for now
  // so we can share code with the old prefetching implementation.
  const task = updateCacheNodeOnNavigation(
    currentCacheNode,
    currentFlightRouterState,
    prefetchFlightRouterState,
    prefetchSeedData,
    prefetchHead
  )
  if (task !== null) {
    const newCacheNode = task.node
    if (newCacheNode !== null) {
      listenForDynamicRequest(task, promiseForDynamicServerResponse)
    }
    return {
      tag: NavigationResultTag.Success,
      data: {
        flightRouterState: task.route,
        cacheNode: newCacheNode !== null ? newCacheNode : currentCacheNode,
        canonicalUrl,
      },
    }
  }
  // The server sent back an empty tree patch. There's nothing to update.
  return noOpNavigationResult
}

function readRenderSnapshotFromCache(
  now: number,
  tree: TreePrefetch
): { flightRouterState: FlightRouterState; seedData: CacheNodeSeedData } {
  let childRouterStates: { [parallelRouteKey: string]: FlightRouterState } = {}
  let childSeedDatas: {
    [parallelRouteKey: string]: CacheNodeSeedData | null
  } = {}
  const slots = tree.slots
  if (slots !== null) {
    for (const parallelRouteKey in slots) {
      const childTree = slots[parallelRouteKey]
      const childResult = readRenderSnapshotFromCache(now, childTree)
      childRouterStates[parallelRouteKey] = childResult.flightRouterState
      childSeedDatas[parallelRouteKey] = childResult.seedData
    }
  }

  let rsc: React.ReactNode | null = null
  let loading: LoadingModuleData | Promise<LoadingModuleData> = null

  const segmentEntry = readSegmentCacheEntry(now, tree.path)
  if (segmentEntry !== null) {
    switch (segmentEntry.status) {
      case EntryStatus.Fulfilled: {
        // Happy path: a cache hit
        rsc = segmentEntry.rsc
        loading = segmentEntry.loading
        break
      }
      case EntryStatus.Pending: {
        // We haven't received data for this segment yet, but there's already
        // an in-progress request. Since it's extremely likely to arrive
        // before the dynamic data response, we might as well use it.
        const promiseForFulfilledEntry = waitForSegmentCacheEntry(segmentEntry)
        rsc = promiseForFulfilledEntry.then((entry) =>
          entry !== null ? entry.rsc : null
        )
        loading = promiseForFulfilledEntry.then((entry) =>
          entry !== null ? entry.loading : null
        )
        break
      }
      case EntryStatus.Rejected:
        break
      default: {
        const _exhaustiveCheck: never = segmentEntry
        break
      }
    }
  }

  const extra = tree.extra
  const flightRouterStateSegment = extra[0]
  const isRootLayout = extra[1]

  return {
    flightRouterState: [
      flightRouterStateSegment,
      childRouterStates,
      null,
      null,
      isRootLayout,
    ],
    seedData: [flightRouterStateSegment, rsc, childSeedDatas, loading],
  }
}

async function navigateDynamicallyWithNoPrefetch(
  url: URL,
  currentCacheNode: CacheNode,
  currentFlightRouterState: FlightRouterState,
  nextUrl: string | null
): Promise<
  MPANavigationResult | SuccessfulNavigationResult | NoOpNavigationResult
> {
  // Runs when a navigation happens but there's no cached prefetch we can use.
  // Don't bother to wait for a prefetch response; go straight to a full
  // navigation that contains both static and dynamic data in a single stream.
  // (This is unlike the old navigation implementation, which instead blocks
  // the dynamic request until a prefetch request is received.)
  //
  // To avoid duplication of logic, we're going to pretend that the tree
  // returned by the dynamic request is, in fact, a prefetch tree. Then we can
  // use the same server response to write the actual data into the CacheNode
  // tree. So it's the same flow as the "happy path" (prefetch, then
  // navigation), except we use a single server response for both stages.

  const promiseForDynamicServerResponse = fetchServerResponse(url, {
    flightRouterState: currentFlightRouterState,
    nextUrl,
  })
  const { flightData, canonicalUrl: canonicalUrlOverride } =
    await promiseForDynamicServerResponse

  // TODO: Detect if the only thing that changed was the hash, like we do in
  // in navigateReducer

  if (typeof flightData === 'string') {
    // This is an MPA navigation.
    const newUrl = flightData
    return {
      tag: NavigationResultTag.MPA,
      data: newUrl,
    }
  }

  // Since the response format of dynamic requests and prefetches is slightly
  // different, we'll need to massage the data a bit. Create FlightRouterState
  // tree that simulates what we'd receive as the result of a prefetch.
  const prefetchFlightRouterState = simulatePrefetchTreeUsingDynamicTreePatch(
    currentFlightRouterState,
    flightData
  )

  // In our simulated prefetch payload, we pretend that there's no seed data
  // nor a prefetch head.
  const prefetchSeedData = null
  const prefetchHead = null

  // Now we proceed exactly as we would for normal navigation.
  return navigateUsingPrefetchedRouteTree(
    currentCacheNode,
    currentFlightRouterState,
    prefetchFlightRouterState,
    prefetchSeedData,
    prefetchHead,
    createCanonicalUrl(canonicalUrlOverride ? canonicalUrlOverride : url),
    promiseForDynamicServerResponse
  )
}

function simulatePrefetchTreeUsingDynamicTreePatch(
  currentTree: FlightRouterState,
  flightData: Array<NormalizedFlightData>
): FlightRouterState {
  // Takes the current FlightRouterState and applies the router state patch
  // received from the server, to create a full FlightRouterState tree that we
  // can pretend was returned by a prefetch.
  //
  // (It sounds similar to what applyRouterStatePatch does, but it doesn't need
  // to handle stuff like interception routes or diffing since that will be
  // handled later.)
  let baseTree = currentTree
  for (const { segmentPath, tree: treePatch } of flightData) {
    // If the server sends us multiple tree patches, we only need to clone the
    // base tree when applying the first patch. After the first patch, we can
    // apply the remaining patches in place without copying.
    const canMutateInPlace = baseTree !== currentTree
    baseTree = simulatePrefetchTreeUsingDynamicTreePatchImpl(
      baseTree,
      treePatch,
      segmentPath,
      canMutateInPlace,
      0
    )
  }

  return baseTree
}

function simulatePrefetchTreeUsingDynamicTreePatchImpl(
  baseRouterState: FlightRouterState,
  patch: FlightRouterState,
  segmentPath: FlightSegmentPath,
  canMutateInPlace: boolean,
  index: number
) {
  if (index === segmentPath.length) {
    // We reached the part of the tree that we need to patch.
    return patch
  }

  // segmentPath represents the parent path of subtree. It's a repeating
  // pattern of parallel route key and segment:
  //
  //   [string, Segment, string, Segment, string, Segment, ...]
  //
  // This path tells us which part of the base tree to apply the tree patch.
  //
  // NOTE: In the case of a fully dynamic request with no prefetch, we receive
  // the FlightRouterState patch in the same request as the dynamic data.
  // Therefore we don't need to worry about diffing the segment values; we can
  // assume the server sent us a correct result.
  const updatedParallelRouteKey: string = segmentPath[index]
  // const segment: Segment = segmentPath[index + 1] <-- Not used, see note above

  const baseChildren = baseRouterState[1]
  const newChildren: { [parallelRouteKey: string]: FlightRouterState } = {}
  for (const parallelRouteKey in baseChildren) {
    if (parallelRouteKey === updatedParallelRouteKey) {
      const childBaseRouterState = baseChildren[parallelRouteKey]
      newChildren[parallelRouteKey] =
        simulatePrefetchTreeUsingDynamicTreePatchImpl(
          childBaseRouterState,
          patch,
          segmentPath,
          canMutateInPlace,
          // Advance the index by two and keep cloning until we reach
          // the end of the segment path.
          index + 2
        )
    } else {
      // This child is not being patched. Copy it over as-is.
      newChildren[parallelRouteKey] = baseChildren[parallelRouteKey]
    }
  }

  if (canMutateInPlace) {
    // We can mutate the base tree in place, because the base tree is already
    // a clone.
    baseRouterState[1] = newChildren
    return baseRouterState
  }

  // Clone all the fields except the children.
  //
  // Based on equivalent logic in apply-router-state-patch-to-tree, but should
  // confirm whether we need to copy all of these fields. Not sure the server
  // ever sends, e.g. the refetch marker.
  const clone: FlightRouterState = [baseRouterState[0], newChildren]
  if (2 in baseRouterState) {
    clone[2] = baseRouterState[2]
  }
  if (3 in baseRouterState) {
    clone[3] = baseRouterState[3]
  }
  if (4 in baseRouterState) {
    clone[4] = baseRouterState[4]
  }
  return clone
}
