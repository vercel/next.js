import type {
  CacheNodeSeedData,
  FlightRouterState,
  FlightSegmentPath,
} from '../../../shared/lib/app-router-types'
import type { CacheNode } from '../../../shared/lib/app-router-types'
import type { HeadData } from '../../../shared/lib/app-router-types'
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
  requestOptimisticRouteCacheEntry,
  convertRootFlightRouterStateToRouteTree,
  type RouteTree,
  type FulfilledRouteCacheEntry,
} from './cache'
import { createCacheKey, type NormalizedSearch } from './cache-key'
import { NavigationResultTag } from './types'
import type { PageVaryPath } from './vary-path'

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
  currentRenderedSearch: string,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  nextUrl: string | null,
  freshnessPolicy: FreshnessPolicy,
  shouldScroll: boolean,
  accumulation: { collectedDebugInfo?: Array<unknown> }
): NavigationResult {
  const now = Date.now()
  const href = url.href

  const cacheKey = createCacheKey(href, nextUrl)
  const route = readRouteCacheEntry(now, cacheKey)
  if (route !== null && route.status === EntryStatus.Fulfilled) {
    // We have a matching prefetch.
    return navigateUsingPrefetchedRouteTree(
      now,
      url,
      currentUrl,
      currentRenderedSearch,
      nextUrl,
      currentCacheNode,
      currentFlightRouterState,
      freshnessPolicy,
      shouldScroll,
      route
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
      return navigateUsingPrefetchedRouteTree(
        now,
        url,
        currentUrl,
        currentRenderedSearch,
        nextUrl,
        currentCacheNode,
        currentFlightRouterState,
        freshnessPolicy,
        shouldScroll,
        optimisticRoute
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
    data: navigateToUnknownRoute(
      now,
      url,
      currentUrl,
      currentRenderedSearch,
      nextUrl,
      currentCacheNode,
      currentFlightRouterState,
      freshnessPolicy,
      shouldScroll,
      collectedDebugInfo
    ),
  }
}

export function navigateToKnownRoute(
  now: number,
  url: URL,
  canonicalUrl: string,
  navigationSeed: NavigationSeed,
  currentUrl: URL,
  currentRenderedSearch: string,
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
  const isSamePageNavigation = url.href === currentUrl.href
  const task = startPPRNavigation(
    now,
    currentUrl,
    currentRenderedSearch,
    currentCacheNode,
    currentFlightRouterState,
    navigationSeed.routeTree,
    navigationSeed.metadataVaryPath,
    freshnessPolicy,
    navigationSeed.data,
    navigationSeed.head,
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
  currentRenderedSearch: string,
  nextUrl: string | null,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  freshnessPolicy: FreshnessPolicy,
  shouldScroll: boolean,
  route: FulfilledRouteCacheEntry
): SuccessfulNavigationResult | MPANavigationResult {
  const routeTree = route.tree
  const canonicalUrl = route.canonicalUrl + url.hash
  const renderedSearch = route.renderedSearch
  const prefetchSeed: NavigationSeed = {
    renderedSearch,
    routeTree,
    metadataVaryPath: route.metadata.varyPath as any,
    data: null,
    head: null,
  }
  return navigateToKnownRoute(
    now,
    url,
    canonicalUrl,
    prefetchSeed,
    currentUrl,
    currentRenderedSearch,
    currentCacheNode,
    currentFlightRouterState,
    freshnessPolicy,
    nextUrl,
    shouldScroll
  )
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

async function navigateToUnknownRoute(
  now: number,
  url: URL,
  currentUrl: URL,
  currentRenderedSearch: string,
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

  return navigateToKnownRoute(
    now,
    url,
    createHrefFromUrl(canonicalUrl),
    navigationSeed,
    currentUrl,
    currentRenderedSearch,
    currentCacheNode,
    currentFlightRouterState,
    freshnessPolicy,
    nextUrl,
    shouldScroll
  )
}

export type NavigationSeed = {
  renderedSearch: string
  routeTree: RouteTree
  metadataVaryPath: PageVaryPath | null
  data: CacheNodeSeedData | null
  head: HeadData | null
}

export function convertServerPatchToFullTree(
  currentTree: FlightRouterState,
  flightData: Array<NormalizedFlightData> | null,
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
  if (flightData !== null) {
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
        renderedSearch,
        0
      )
      baseTree = result.tree
      baseData = result.data
      // This is the same for all patches per response, so just pick an
      // arbitrary one
      head = headPatch
    }
  }

  const finalFlightRouterState = baseTree

  // Convert the final FlightRouterState into a RouteTree type.
  //
  // TODO: Eventually, FlightRouterState will evolve to being a transport format
  // only. The RouteTree type will become the main type used for dealing with
  // routes on the client, and we'll store it in the state directly.
  const acc = { metadataVaryPath: null }
  const routeTree = convertRootFlightRouterStateToRouteTree(
    finalFlightRouterState,
    renderedSearch as NormalizedSearch,
    acc
  )

  return {
    routeTree,
    metadataVaryPath: acc.metadataVaryPath,
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
  renderedSearch: string,
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
        renderedSearch,
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
    const compressedRefreshState = baseRouterState[2]
    if (
      compressedRefreshState !== undefined &&
      compressedRefreshState !== null
    ) {
      // Since this part of the tree was patched with new data, any parent
      // refresh states should be updated to reflect the new rendered search
      // value. (The refresh state acts like a "context provider".) All pages
      // within the same server response share the same renderedSearch value,
      // but the same RouteTree could be composed from multiple different
      // routes, and multiple responses.
      clonedTree[2] = [compressedRefreshState[0], renderedSearch]
    }
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
