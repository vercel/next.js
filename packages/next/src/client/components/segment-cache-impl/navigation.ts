import type {
  CacheNodeSeedData,
  FlightRouterState,
  FlightSegmentPath,
} from '../../../shared/lib/app-router-types'
import type { CacheNode } from '../../../shared/lib/app-router-types'
import type {
  HeadData,
  LoadingModuleData,
} from '../../../shared/lib/app-router-types'
import type { NormalizedFlightData } from '../../flight-data-helpers'
import { fetchServerResponse } from '../router-reducer/fetch-server-response'
import {
  startPPRNavigation,
  listenForDynamicRequest,
  type Task as PPRNavigationTask,
} from '../router-reducer/ppr-navigations'
import { createHrefFromUrl } from '../router-reducer/create-href-from-url'
import {
  EntryStatus,
  readRouteCacheEntry,
  readSegmentCacheEntry,
  waitForSegmentCacheEntry,
  requestOptimisticRouteCacheEntry,
  type RouteTree,
  type FulfilledRouteCacheEntry,
} from './cache'
import { createCacheKey } from './cache-key'
import { addSearchParamsIfPageSegment } from '../../../shared/lib/segment'
import { NavigationResultTag } from '../segment-cache'

type MPANavigationResult = {
  tag: NavigationResultTag.MPA
  data: string
}

type NoOpNavigationResult = {
  tag: NavigationResultTag.NoOp
  data: {
    canonicalUrl: string
    shouldScroll: boolean
  }
}

type SuccessfulNavigationResult = {
  tag: NavigationResultTag.Success
  data: {
    flightRouterState: FlightRouterState
    cacheNode: CacheNode
    canonicalUrl: string
    renderedSearch: string
    scrollableSegments: Array<FlightSegmentPath>
    shouldScroll: boolean
    hash: string
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
  currentUrl: URL,
  currentCacheNode: CacheNode,
  currentFlightRouterState: FlightRouterState,
  nextUrl: string | null,
  shouldScroll: boolean,
  accumulation: { collectedDebugInfo?: Array<unknown> }
): NavigationResult {
  const now = Date.now()
  const href = url.href

  // We special case navigations to the exact same URL as the current location.
  // It's a common UI pattern for apps to refresh when you click a link to the
  // current page. So when this happens, we refresh the dynamic data in the page
  // segments.
  //
  // Note that this does not apply if the any part of the hash or search query
  // has changed. This might feel a bit weird but it makes more sense when you
  // consider that the way to trigger this behavior is to click the same link
  // multiple times.
  //
  // TODO: We should probably refresh the *entire* route when this case occurs,
  // not just the page segments. Essentially treating it the same as a refresh()
  // triggered by an action, which is the more explicit way of modeling the UI
  // pattern described above.
  //
  // Also note that this only refreshes the dynamic data, not static/ cached
  // data. If the page segment is fully static and prefetched, the request is
  // skipped. (This is also how refresh() works.)
  const isSamePageNavigation =
    // TODO: This is not the only place we read from the location, but we should
    // consider storing the current URL in the router state instead of reading
    // from the location object. In practice I don't think this matters much
    // since we keep them in sync anyway, but having two sources of truth can
    // lead to subtle bugs and race conditions.
    href === window.location.href

  const cacheKey = createCacheKey(href, nextUrl)
  const route = readRouteCacheEntry(now, cacheKey)
  if (route !== null && route.status === EntryStatus.Fulfilled) {
    // We have a matching prefetch.
    const snapshot = readRenderSnapshotFromCache(now, route, route.tree)
    const prefetchFlightRouterState = snapshot.flightRouterState
    const prefetchSeedData = snapshot.seedData
    const prefetchHead = route.head
    const isPrefetchHeadPartial = route.isHeadPartial
    const newCanonicalUrl = route.canonicalUrl
    const renderedSearch = route.renderedSearch
    return navigateUsingPrefetchedRouteTree(
      now,
      url,
      currentUrl,
      nextUrl,
      isSamePageNavigation,
      currentCacheNode,
      currentFlightRouterState,
      prefetchFlightRouterState,
      prefetchSeedData,
      prefetchHead,
      isPrefetchHeadPartial,
      newCanonicalUrl,
      renderedSearch,
      shouldScroll,
      url.hash
    )
  }

  // There was no matching route tree in the cache. Let's see if we can
  // construct an "optimistic" route tree.
  //
  // Do not construct an optimistic route tree if there was a cache hit, but
  // the entry has a rejected status, since it may have been rejected due to a
  // rewrite or redirect based on the search params.
  //
  // TODO: There are multiple reasons a prefetch might be rejected; we should
  // track them explicitly and choose what to do here based on that.
  if (route === null || route.status !== EntryStatus.Rejected) {
    const optimisticRoute = requestOptimisticRouteCacheEntry(now, url, nextUrl)
    if (optimisticRoute !== null) {
      // We have an optimistic route tree. Proceed with the normal flow.
      const snapshot = readRenderSnapshotFromCache(
        now,
        optimisticRoute,
        optimisticRoute.tree
      )
      const prefetchFlightRouterState = snapshot.flightRouterState
      const prefetchSeedData = snapshot.seedData
      const prefetchHead = optimisticRoute.head
      const isPrefetchHeadPartial = optimisticRoute.isHeadPartial
      const newCanonicalUrl = optimisticRoute.canonicalUrl
      const newRenderedSearch = optimisticRoute.renderedSearch
      return navigateUsingPrefetchedRouteTree(
        now,
        url,
        currentUrl,
        nextUrl,
        isSamePageNavigation,
        currentCacheNode,
        currentFlightRouterState,
        prefetchFlightRouterState,
        prefetchSeedData,
        prefetchHead,
        isPrefetchHeadPartial,
        newCanonicalUrl,
        newRenderedSearch,
        shouldScroll,
        url.hash
      )
    }
  }

  // There's no matching prefetch for this route in the cache.
  let collectedDebugInfo = accumulation.collectedDebugInfo ?? []
  if (accumulation.collectedDebugInfo === undefined) {
    collectedDebugInfo = accumulation.collectedDebugInfo = []
  }
  return {
    tag: NavigationResultTag.Async,
    data: navigateDynamicallyWithNoPrefetch(
      now,
      url,
      currentUrl,
      nextUrl,
      isSamePageNavigation,
      currentCacheNode,
      currentFlightRouterState,
      shouldScroll,
      url.hash,
      collectedDebugInfo
    ),
  }
}

function navigateUsingPrefetchedRouteTree(
  now: number,
  url: URL,
  currentUrl: URL,
  nextUrl: string | null,
  isSamePageNavigation: boolean,
  currentCacheNode: CacheNode,
  currentFlightRouterState: FlightRouterState,
  prefetchFlightRouterState: FlightRouterState,
  prefetchSeedData: CacheNodeSeedData | null,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  canonicalUrl: string,
  renderedSearch: string,
  shouldScroll: boolean,
  hash: string
): SuccessfulNavigationResult | NoOpNavigationResult | MPANavigationResult {
  // Recursively construct a prefetch tree by reading from the Segment Cache. To
  // maintain compatibility, we output the same data structures as the old
  // prefetching implementation: FlightRouterState and CacheNodeSeedData.
  // TODO: Eventually updateCacheNodeOnNavigation (or the equivalent) should
  // read from the Segment Cache directly. It's only structured this way for now
  // so we can share code with the old prefetching implementation.
  const scrollableSegments: Array<FlightSegmentPath> = []
  const task = startPPRNavigation(
    now,
    currentUrl,
    currentCacheNode,
    currentFlightRouterState,
    prefetchFlightRouterState,
    prefetchSeedData,
    prefetchHead,
    isPrefetchHeadPartial,
    isSamePageNavigation,
    scrollableSegments
  )
  if (task !== null) {
    const dynamicRequestTree = task.dynamicRequestTree
    if (dynamicRequestTree !== null) {
      const promiseForDynamicServerResponse = fetchServerResponse(
        new URL(canonicalUrl, url.origin),
        {
          flightRouterState: dynamicRequestTree,
          nextUrl,
        }
      )
      listenForDynamicRequest(task, promiseForDynamicServerResponse)
    } else {
      // The prefetched tree does not contain dynamic holes — it's
      // fully static. We can skip the dynamic request.
    }
    return navigationTaskToResult(
      task,
      currentCacheNode,
      canonicalUrl,
      renderedSearch,
      scrollableSegments,
      shouldScroll,
      hash
    )
  }
  // The server sent back an empty tree patch. There's nothing to update, except
  // possibly the URL.
  return {
    tag: NavigationResultTag.NoOp,
    data: {
      canonicalUrl,
      shouldScroll,
    },
  }
}

function navigationTaskToResult(
  task: PPRNavigationTask,
  currentCacheNode: CacheNode,
  canonicalUrl: string,
  renderedSearch: string,
  scrollableSegments: Array<FlightSegmentPath>,
  shouldScroll: boolean,
  hash: string
): SuccessfulNavigationResult | MPANavigationResult {
  const flightRouterState = task.route
  if (flightRouterState === null) {
    // When no router state is provided, it signals that we should perform an
    // MPA navigation.
    return {
      tag: NavigationResultTag.MPA,
      data: canonicalUrl,
    }
  }
  const newCacheNode = task.node
  return {
    tag: NavigationResultTag.Success,
    data: {
      flightRouterState,
      cacheNode: newCacheNode !== null ? newCacheNode : currentCacheNode,
      canonicalUrl,
      renderedSearch,
      scrollableSegments,
      shouldScroll,
      hash,
    },
  }
}

function readRenderSnapshotFromCache(
  now: number,
  route: FulfilledRouteCacheEntry,
  tree: RouteTree
): { flightRouterState: FlightRouterState; seedData: CacheNodeSeedData } {
  let childRouterStates: { [parallelRouteKey: string]: FlightRouterState } = {}
  let childSeedDatas: {
    [parallelRouteKey: string]: CacheNodeSeedData | null
  } = {}
  const slots = tree.slots
  if (slots !== null) {
    for (const parallelRouteKey in slots) {
      const childTree = slots[parallelRouteKey]
      const childResult = readRenderSnapshotFromCache(now, route, childTree)
      childRouterStates[parallelRouteKey] = childResult.flightRouterState
      childSeedDatas[parallelRouteKey] = childResult.seedData
    }
  }

  let rsc: React.ReactNode | null = null
  let loading: LoadingModuleData | Promise<LoadingModuleData> = null
  let isPartial: boolean = true

  const segmentEntry = readSegmentCacheEntry(now, route, tree.cacheKey)
  if (segmentEntry !== null) {
    switch (segmentEntry.status) {
      case EntryStatus.Fulfilled: {
        // Happy path: a cache hit
        rsc = segmentEntry.rsc
        loading = segmentEntry.loading
        isPartial = segmentEntry.isPartial
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
        // Since we don't know yet whether the segment is partial or fully
        // static, we must assume it's partial; we can't skip the
        // dynamic request.
        isPartial = true
        break
      }
      case EntryStatus.Empty:
      case EntryStatus.Rejected:
        break
      default:
        segmentEntry satisfies never
    }
  }

  // The navigation implementation expects the search params to be
  // included in the segment. However, the Segment Cache tracks search
  // params separately from the rest of the segment key. So we need to
  // add them back here.
  //
  // See corresponding comment in convertFlightRouterStateToTree.
  //
  // TODO: What we should do instead is update the navigation diffing
  // logic to compare search params explicitly. This is a temporary
  // solution until more of the Segment Cache implementation has settled.
  const segment = addSearchParamsIfPageSegment(
    tree.segment,
    Object.fromEntries(new URLSearchParams(route.renderedSearch))
  )

  // We don't need this information in a render snapshot, so this can just be a placeholder.
  const hasRuntimePrefetch = false

  return {
    flightRouterState: [
      segment,
      childRouterStates,
      null,
      null,
      tree.isRootLayout,
    ],
    seedData: [rsc, childSeedDatas, loading, isPartial, hasRuntimePrefetch],
  }
}

async function navigateDynamicallyWithNoPrefetch(
  now: number,
  url: URL,
  currentUrl: URL,
  nextUrl: string | null,
  isSamePageNavigation: boolean,
  currentCacheNode: CacheNode,
  currentFlightRouterState: FlightRouterState,
  shouldScroll: boolean,
  hash: string,
  collectedDebugInfo: Array<unknown>
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
  const result = await promiseForDynamicServerResponse
  if (typeof result === 'string') {
    // This is an MPA navigation.
    const newUrl = result
    return {
      tag: NavigationResultTag.MPA,
      data: newUrl,
    }
  }

  const {
    flightData,
    canonicalUrl,
    renderedSearch,
    debugInfo: debugInfoFromResponse,
  } = result
  if (debugInfoFromResponse !== null) {
    collectedDebugInfo.push(...debugInfoFromResponse)
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
  const isPrefetchHeadPartial = true

  // Now we proceed exactly as we would for normal navigation.
  const scrollableSegments: Array<FlightSegmentPath> = []
  const task = startPPRNavigation(
    now,
    currentUrl,
    currentCacheNode,
    currentFlightRouterState,
    prefetchFlightRouterState,
    prefetchSeedData,
    prefetchHead,
    isPrefetchHeadPartial,
    isSamePageNavigation,
    scrollableSegments
  )
  if (task !== null) {
    // In this case, we've already sent the dynamic request, so we don't
    // actually use the request tree created by `startPPRNavigation`,
    // except to check if it contains dynamic holes.
    //
    // This is almost always true, but it could be false if all the segment data
    // was present in the cache, but the route tree was not. E.g. navigating
    // to a URL that was not prefetched but rewrites to a different URL
    // that was.
    const hasDynamicHoles = task.dynamicRequestTree !== null
    if (hasDynamicHoles) {
      listenForDynamicRequest(task, promiseForDynamicServerResponse)
    } else {
      // The prefetched tree does not contain dynamic holes — it's
      // fully static. We don't need to process the server response further.
    }
    return navigationTaskToResult(
      task,
      currentCacheNode,
      createHrefFromUrl(canonicalUrl),
      renderedSearch,
      scrollableSegments,
      shouldScroll,
      hash
    )
  }
  // The server sent back an empty tree patch. There's nothing to update, except
  // possibly the URL.
  return {
    tag: NavigationResultTag.NoOp,
    data: {
      canonicalUrl: createHrefFromUrl(canonicalUrl),
      shouldScroll,
    },
  }
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
