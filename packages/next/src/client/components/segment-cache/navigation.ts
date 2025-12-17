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
  spawnDynamicRequests,
  FreshnessPolicy,
  type NavigationTask,
  type NavigationRequestAccumulation,
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
import { NavigationResultTag } from './types'

type MPANavigationResult = {
  tag: NavigationResultTag.MPA
  data: string
}

type SuccessfulNavigationResult = {
  tag: NavigationResultTag.Success
  data: {
    flightRouterState: FlightRouterState
    cacheNode: CacheNode
    canonicalUrl: string
    renderedSearch: string
    scrollableSegments: Array<FlightSegmentPath> | null
    shouldScroll: boolean
    hash: string
  }
}

type AsyncNavigationResult = {
  tag: NavigationResultTag.Async
  data: Promise<MPANavigationResult | SuccessfulNavigationResult>
}

export type NavigationResult =
  | MPANavigationResult
  | SuccessfulNavigationResult
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
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  nextUrl: string | null,
  freshnessPolicy: FreshnessPolicy,
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
  const isSamePageNavigation = href === currentUrl.href

  const cacheKey = createCacheKey(href, nextUrl)
  const route = readRouteCacheEntry(now, cacheKey)
  if (route !== null && route.status === EntryStatus.Fulfilled) {
    // We have a matching prefetch.
    const snapshot = readRenderSnapshotFromCache(now, route, route.tree)
    const prefetchFlightRouterState = snapshot.flightRouterState
    const prefetchSeedData = snapshot.seedData
    const headSnapshot = readHeadSnapshotFromCache(now, route)
    const prefetchHead = headSnapshot.rsc
    const isPrefetchHeadPartial = headSnapshot.isPartial
    // TODO: The "canonicalUrl" stored in the cache doesn't include the hash,
    // because hash entries do not vary by hash fragment. However, the one
    // we set in the router state *does* include the hash, and it's used to
    // sync with the actual browser location. To make this less of a refactor
    // hazard, we should always track the hash separately from the rest of
    // the URL.
    const newCanonicalUrl = route.canonicalUrl + url.hash
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
      freshnessPolicy,
      shouldScroll
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
      const headSnapshot = readHeadSnapshotFromCache(now, optimisticRoute)
      const prefetchHead = headSnapshot.rsc
      const isPrefetchHeadPartial = headSnapshot.isPartial
      const newCanonicalUrl = optimisticRoute.canonicalUrl + url.hash
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
        freshnessPolicy,
        shouldScroll
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
      currentCacheNode,
      currentFlightRouterState,
      freshnessPolicy,
      shouldScroll,
      collectedDebugInfo
    ),
  }
}

export function navigateToSeededRoute(
  now: number,
  url: URL,
  canonicalUrl: string,
  navigationSeed: NavigationSeed,
  currentUrl: URL,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  freshnessPolicy: FreshnessPolicy,
  nextUrl: string | null,
  shouldScroll: boolean
): SuccessfulNavigationResult | MPANavigationResult {
  // A version of navigate() that accepts the target route tree as an argument
  // rather than reading it from the prefetch cache.
  const accumulation: NavigationRequestAccumulation = {
    scrollableSegments: null,
    separateRefreshUrls: null,
  }
  const isSamePageNavigation = url.href === currentUrl.href
  const task = startPPRNavigation(
    now,
    currentUrl,
    currentCacheNode,
    currentFlightRouterState,
    navigationSeed.tree,
    freshnessPolicy,
    navigationSeed.data,
    navigationSeed.head,
    null,
    null,
    false,
    isSamePageNavigation,
    accumulation
  )
  if (task !== null) {
    spawnDynamicRequests(task, url, nextUrl, freshnessPolicy, accumulation)
    return navigationTaskToResult(
      task,
      canonicalUrl,
      navigationSeed.renderedSearch,
      accumulation.scrollableSegments,
      shouldScroll,
      url.hash
    )
  }
  // Could not perform a SPA navigation. Revert to a full-page (MPA) navigation.
  return {
    tag: NavigationResultTag.MPA,
    data: canonicalUrl,
  }
}

function navigateUsingPrefetchedRouteTree(
  now: number,
  url: URL,
  currentUrl: URL,
  nextUrl: string | null,
  isSamePageNavigation: boolean,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  prefetchFlightRouterState: FlightRouterState,
  prefetchSeedData: CacheNodeSeedData | null,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  canonicalUrl: string,
  renderedSearch: string,
  freshnessPolicy: FreshnessPolicy,
  shouldScroll: boolean
): SuccessfulNavigationResult | MPANavigationResult {
  // Recursively construct a prefetch tree by reading from the Segment Cache. To
  // maintain compatibility, we output the same data structures as the old
  // prefetching implementation: FlightRouterState and CacheNodeSeedData.
  // TODO: Eventually updateCacheNodeOnNavigation (or the equivalent) should
  // read from the Segment Cache directly. It's only structured this way for now
  // so we can share code with the old prefetching implementation.
  const accumulation: NavigationRequestAccumulation = {
    scrollableSegments: null,
    separateRefreshUrls: null,
  }
  const seedData = null
  const seedHead = null
  const task = startPPRNavigation(
    now,
    currentUrl,
    currentCacheNode,
    currentFlightRouterState,
    prefetchFlightRouterState,
    freshnessPolicy,
    seedData,
    seedHead,
    prefetchSeedData,
    prefetchHead,
    isPrefetchHeadPartial,
    isSamePageNavigation,
    accumulation
  )
  if (task !== null) {
    spawnDynamicRequests(task, url, nextUrl, freshnessPolicy, accumulation)
    return navigationTaskToResult(
      task,
      canonicalUrl,
      renderedSearch,
      accumulation.scrollableSegments,
      shouldScroll,
      url.hash
    )
  }
  // Could not perform a SPA navigation. Revert to a full-page (MPA) navigation.
  return {
    tag: NavigationResultTag.MPA,
    data: canonicalUrl,
  }
}

function navigationTaskToResult(
  task: NavigationTask,
  canonicalUrl: string,
  renderedSearch: string,
  scrollableSegments: Array<FlightSegmentPath> | null,
  shouldScroll: boolean,
  hash: string
): SuccessfulNavigationResult | MPANavigationResult {
  return {
    tag: NavigationResultTag.Success,
    data: {
      flightRouterState: task.route,
      cacheNode: task.node,
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

  const segmentEntry = readSegmentCacheEntry(now, tree.varyPath)
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
        // Because the request is still pending, we typically don't know yet
        // whether the response will be partial. We shouldn't skip this segment
        // during the dynamic navigation request. Otherwise, we might need to
        // do yet another request to fill in the remaining data, creating
        // a waterfall.
        //
        // The one exception is if this segment is being fetched with via
        // prefetch={true} (i.e. the "force stale" or "full" strategy). If so,
        // we can assume the response will be full. This field is set to `false`
        // for such segments.
        isPartial = segmentEntry.isPartial
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

function readHeadSnapshotFromCache(
  now: number,
  route: FulfilledRouteCacheEntry
): { rsc: HeadData; isPartial: boolean } {
  // Same as readRenderSnapshotFromCache, but for the head
  let rsc: React.ReactNode | null = null
  let isPartial: boolean = true
  const segmentEntry = readSegmentCacheEntry(now, route.metadata.varyPath)
  if (segmentEntry !== null) {
    switch (segmentEntry.status) {
      case EntryStatus.Fulfilled: {
        rsc = segmentEntry.rsc
        isPartial = segmentEntry.isPartial
        break
      }
      case EntryStatus.Pending: {
        const promiseForFulfilledEntry = waitForSegmentCacheEntry(segmentEntry)
        rsc = promiseForFulfilledEntry.then((entry) =>
          entry !== null ? entry.rsc : null
        )
        isPartial = segmentEntry.isPartial
        break
      }
      case EntryStatus.Empty:
      case EntryStatus.Rejected:
        break
      default:
        segmentEntry satisfies never
    }
  }
  return { rsc, isPartial }
}

// Used to request all the dynamic data for a route, rather than just a subset,
// e.g. during a refresh or a revalidation. Typically this gets constructed
// during the normal flow when diffing the route tree, but for an unprefetched
// navigation, where we don't know the structure of the target route, we use
// this instead.
const DynamicRequestTreeForEntireRoute: FlightRouterState = [
  '',
  {},
  null,
  'refetch',
]

async function navigateDynamicallyWithNoPrefetch(
  now: number,
  url: URL,
  currentUrl: URL,
  nextUrl: string | null,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  freshnessPolicy: FreshnessPolicy,
  shouldScroll: boolean,
  collectedDebugInfo: Array<unknown>
): Promise<MPANavigationResult | SuccessfulNavigationResult> {
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

  let dynamicRequestTree: FlightRouterState
  switch (freshnessPolicy) {
    case FreshnessPolicy.Default:
    case FreshnessPolicy.HistoryTraversal:
      dynamicRequestTree = currentFlightRouterState
      break
    case FreshnessPolicy.Hydration: // <- shouldn't happen during client nav
    case FreshnessPolicy.RefreshAll:
    case FreshnessPolicy.HMRRefresh:
      dynamicRequestTree = DynamicRequestTreeForEntireRoute
      break
    default:
      freshnessPolicy satisfies never
      dynamicRequestTree = currentFlightRouterState
      break
  }

  const promiseForDynamicServerResponse = fetchServerResponse(url, {
    flightRouterState: dynamicRequestTree,
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
  const navigationSeed = convertServerPatchToFullTree(
    currentFlightRouterState,
    flightData,
    renderedSearch
  )

  return navigateToSeededRoute(
    now,
    url,
    createHrefFromUrl(canonicalUrl),
    navigationSeed,
    currentUrl,
    currentCacheNode,
    currentFlightRouterState,
    freshnessPolicy,
    nextUrl,
    shouldScroll
  )
}

export type NavigationSeed = {
  tree: FlightRouterState
  renderedSearch: string
  data: CacheNodeSeedData | null
  head: HeadData | null
}

export function convertServerPatchToFullTree(
  currentTree: FlightRouterState,
  flightData: Array<NormalizedFlightData>,
  renderedSearch: string
): NavigationSeed {
  // During a client navigation or prefetch, the server sends back only a patch
  // for the parts of the tree that have changed.
  //
  // This applies the patch to the base tree to create a full representation of
  // the resulting tree.
  //
  // The return type includes a full FlightRouterState tree and a full
  // CacheNodeSeedData tree. (Conceptually these are the same tree, and should
  // eventually be unified, but there's still lots of existing code that
  // operates on FlightRouterState trees alone without the CacheNodeSeedData.)
  //
  // TODO: This similar to what apply-router-state-patch-to-tree does. It
  // will eventually fully replace it. We should get rid of all the remaining
  // places where we iterate over the server patch format. This should also
  // eventually replace normalizeFlightData.

  let baseTree: FlightRouterState = currentTree
  let baseData: CacheNodeSeedData | null = null
  let head: HeadData | null = null
  for (const {
    segmentPath,
    tree: treePatch,
    seedData: dataPatch,
    head: headPatch,
  } of flightData) {
    const result = convertServerPatchToFullTreeImpl(
      baseTree,
      baseData,
      treePatch,
      dataPatch,
      segmentPath,
      0
    )
    baseTree = result.tree
    baseData = result.data
    // This is the same for all patches per response, so just pick an
    // arbitrary one
    head = headPatch
  }

  return {
    tree: baseTree,
    data: baseData,
    renderedSearch,
    head,
  }
}

function convertServerPatchToFullTreeImpl(
  baseRouterState: FlightRouterState,
  baseData: CacheNodeSeedData | null,
  treePatch: FlightRouterState,
  dataPatch: CacheNodeSeedData | null,
  segmentPath: FlightSegmentPath,
  index: number
): { tree: FlightRouterState; data: CacheNodeSeedData | null } {
  if (index === segmentPath.length) {
    // We reached the part of the tree that we need to patch.
    return {
      tree: treePatch,
      data: dataPatch,
    }
  }

  // segmentPath represents the parent path of subtree. It's a repeating
  // pattern of parallel route key and segment:
  //
  //   [string, Segment, string, Segment, string, Segment, ...]
  //
  // This path tells us which part of the base tree to apply the tree patch.
  //
  // NOTE: We receive the FlightRouterState patch in the same request as the
  // seed data patch. Therefore we don't need to worry about diffing the segment
  // values; we can assume the server sent us a correct result.
  const updatedParallelRouteKey: string = segmentPath[index]
  // const segment: Segment = segmentPath[index + 1] <-- Not used, see note above

  const baseTreeChildren = baseRouterState[1]
  const baseSeedDataChildren = baseData !== null ? baseData[1] : null
  const newTreeChildren: Record<string, FlightRouterState> = {}
  const newSeedDataChildren: Record<string, CacheNodeSeedData | null> = {}
  for (const parallelRouteKey in baseTreeChildren) {
    const childBaseRouterState = baseTreeChildren[parallelRouteKey]
    const childBaseSeedData =
      baseSeedDataChildren !== null
        ? (baseSeedDataChildren[parallelRouteKey] ?? null)
        : null
    if (parallelRouteKey === updatedParallelRouteKey) {
      const result = convertServerPatchToFullTreeImpl(
        childBaseRouterState,
        childBaseSeedData,
        treePatch,
        dataPatch,
        segmentPath,
        // Advance the index by two and keep cloning until we reach
        // the end of the segment path.
        index + 2
      )

      newTreeChildren[parallelRouteKey] = result.tree
      newSeedDataChildren[parallelRouteKey] = result.data
    } else {
      // This child is not being patched. Copy it over as-is.
      newTreeChildren[parallelRouteKey] = childBaseRouterState
      newSeedDataChildren[parallelRouteKey] = childBaseSeedData
    }
  }

  let clonedTree: FlightRouterState
  let clonedSeedData: CacheNodeSeedData
  // Clone all the fields except the children.

  // Clone the FlightRouterState tree. Based on equivalent logic in
  // apply-router-state-patch-to-tree, but should confirm whether we need to
  // copy all of these fields. Not sure the server ever sends, e.g. the
  // refetch marker.
  clonedTree = [baseRouterState[0], newTreeChildren]
  if (2 in baseRouterState) {
    clonedTree[2] = baseRouterState[2]
  }
  if (3 in baseRouterState) {
    clonedTree[3] = baseRouterState[3]
  }
  if (4 in baseRouterState) {
    clonedTree[4] = baseRouterState[4]
  }

  // Clone the CacheNodeSeedData tree.
  const isEmptySeedDataPartial = true
  clonedSeedData = [
    null,
    newSeedDataChildren,
    null,
    isEmptySeedDataPartial,
    false,
  ]

  return {
    tree: clonedTree,
    data: clonedSeedData,
  }
}
