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
  type NavigationRequestAccumulation,
} from '../router-reducer/ppr-navigations'
import { createHrefFromUrl } from '../router-reducer/create-href-from-url'
import {
  EntryStatus,
  readRouteCacheEntry,
  deprecated_requestOptimisticRouteCacheEntry,
  convertRootFlightRouterStateToRouteTree,
  type RouteTree,
  type FulfilledRouteCacheEntry,
} from './cache'
import { discoverKnownRoute } from './optimistic-routes'
import { createCacheKey, type NormalizedSearch } from './cache-key'
import { schedulePrefetchTask } from './scheduler'
import { PrefetchPriority, FetchStrategy } from './types'
import { getLinkForCurrentNavigation } from '../links'
import type { PageVaryPath } from './vary-path'
import type { AppRouterState } from '../router-reducer/router-reducer-types'
import { computeChangedPath } from '../router-reducer/compute-changed-path'
import { isJavaScriptURLString } from '../../lib/javascript-url'

/**
 * Navigate to a new URL, using the Segment Cache to construct a response.
 *
 * To allow for synchronous navigations whenever possible, this is not an async
 * function. It returns a promise only if there's no matching prefetch in
 * the cache. Otherwise it returns an immediate result and uses Suspense/RSC to
 * stream in any missing data.
 */
export function navigate(
  state: AppRouterState,
  url: URL,
  currentUrl: URL,
  currentRenderedSearch: string,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  nextUrl: string | null,
  freshnessPolicy: FreshnessPolicy,
  shouldScroll: boolean,
  navigateType: 'push' | 'replace'
): AppRouterState | Promise<AppRouterState> {
  const now = Date.now()
  const href = url.href

  const cacheKey = createCacheKey(href, nextUrl)
  const route = readRouteCacheEntry(now, cacheKey)
  if (route !== null && route.status === EntryStatus.Fulfilled) {
    // We have a matching prefetch.
    return navigateUsingPrefetchedRouteTree(
      now,
      state,
      url,
      currentUrl,
      currentRenderedSearch,
      nextUrl,
      currentCacheNode,
      currentFlightRouterState,
      freshnessPolicy,
      shouldScroll,
      navigateType,
      route
    )
  }

  // There was no matching route tree in the cache. Let's see if we can
  // construct an "optimistic" route tree using the deprecated search-params
  // based matching. This is only used when the new optimisticRouting flag is
  // disabled.
  //
  // Do not construct an optimistic route tree if there was a cache hit, but
  // the entry has a rejected status, since it may have been rejected due to a
  // rewrite or redirect based on the search params.
  //
  // TODO: There are multiple reasons a prefetch might be rejected; we should
  // track them explicitly and choose what to do here based on that.
  if (!process.env.__NEXT_OPTIMISTIC_ROUTING) {
    if (route === null || route.status !== EntryStatus.Rejected) {
      const optimisticRoute = deprecated_requestOptimisticRouteCacheEntry(
        now,
        url,
        nextUrl
      )
      if (optimisticRoute !== null) {
        // We have an optimistic route tree. Proceed with the normal flow.
        return navigateUsingPrefetchedRouteTree(
          now,
          state,
          url,
          currentUrl,
          currentRenderedSearch,
          nextUrl,
          currentCacheNode,
          currentFlightRouterState,
          freshnessPolicy,
          shouldScroll,
          navigateType,
          optimisticRoute
        )
      }
    }
  }

  // There's no matching prefetch for this route in the cache. We must lazily
  // fetch it from the server before we can perform the navigation.
  //
  // TODO: If this is a gesture navigation, instead of performing a
  // dynamic request, we should do a runtime prefetch.
  return navigateToUnknownRoute(
    now,
    state,
    url,
    currentUrl,
    currentRenderedSearch,
    nextUrl,
    currentCacheNode,
    currentFlightRouterState,
    freshnessPolicy,
    shouldScroll,
    navigateType
  ).catch(() => {
    // If the navigation fails, return the current state
    return state
  })
}

export function navigateToKnownRoute(
  now: number,
  state: AppRouterState,
  url: URL,
  canonicalUrl: string,
  navigationSeed: NavigationSeed,
  currentUrl: URL,
  currentRenderedSearch: string,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  freshnessPolicy: FreshnessPolicy,
  nextUrl: string | null,
  shouldScroll: boolean,
  navigateType: 'push' | 'replace',
  debugInfo: Array<unknown> | null,
  // The route cache entry used for this navigation, if it came from route
  // prediction. Passed through so it can be marked as having a dynamic rewrite
  // if the server returns a different pathname (indicating dynamic rewrite
  // behavior).
  //
  // When null, the navigation did not use route prediction - either because
  // the route was already fully cached, or it's a navigation that doesn't
  // involve prediction (refresh, history traversal, server action, etc.).
  // In these cases, if a mismatch occurs, we still mark the route as having a
  // dynamic rewrite by traversing the known route tree (see
  // dispatchRetryDueToTreeMismatch).
  routeCacheEntry: FulfilledRouteCacheEntry | null
): AppRouterState {
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
    if (freshnessPolicy !== FreshnessPolicy.Gesture) {
      spawnDynamicRequests(
        task,
        url,
        nextUrl,
        freshnessPolicy,
        accumulation,
        routeCacheEntry
      )
    }
    return completeSoftNavigation(
      state,
      url,
      nextUrl,
      task.route,
      task.node,
      navigationSeed.renderedSearch,
      canonicalUrl,
      navigateType,
      shouldScroll,
      accumulation.scrollableSegments,
      debugInfo
    )
  }
  // Could not perform a SPA navigation. Revert to a full-page (MPA) navigation.
  return completeHardNavigation(state, url, navigateType)
}

function navigateUsingPrefetchedRouteTree(
  now: number,
  state: AppRouterState,
  url: URL,
  currentUrl: URL,
  currentRenderedSearch: string,
  nextUrl: string | null,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  freshnessPolicy: FreshnessPolicy,
  shouldScroll: boolean,
  navigateType: 'push' | 'replace',
  route: FulfilledRouteCacheEntry
): AppRouterState {
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
    state,
    url,
    canonicalUrl,
    prefetchSeed,
    currentUrl,
    currentRenderedSearch,
    currentCacheNode,
    currentFlightRouterState,
    freshnessPolicy,
    nextUrl,
    shouldScroll,
    navigateType,
    null,
    route
  )
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
  state: AppRouterState,
  url: URL,
  currentUrl: URL,
  currentRenderedSearch: string,
  nextUrl: string | null,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  freshnessPolicy: FreshnessPolicy,
  shouldScroll: boolean,
  navigateType: 'push' | 'replace'
): Promise<AppRouterState> {
  // If the Instant Navigation Testing API lock is active, try to prefetch the
  // route first. If the prefetch succeeds, navigate using the prefetched route
  // tree. If it fails, fall through to the normal path.
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    const prefetchResult = await tryNavigateUsingTestingAPIPrefetch(
      state,
      url,
      currentUrl,
      currentRenderedSearch,
      nextUrl,
      currentCacheNode,
      currentFlightRouterState,
      freshnessPolicy,
      shouldScroll,
      navigateType
    )
    if (prefetchResult !== null) {
      return prefetchResult
    }
  }

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
    case FreshnessPolicy.Gesture:
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
    const redirectUrl = new URL(result, location.origin)
    return completeHardNavigation(state, redirectUrl, navigateType)
  }

  const {
    flightData,
    canonicalUrl,
    renderedSearch,
    couldBeIntercepted,
    prerendered,
    debugInfo,
  } = result

  // Since the response format of dynamic requests and prefetches is slightly
  // different, we'll need to massage the data a bit. Create FlightRouterState
  // tree that simulates what we'd receive as the result of a prefetch.
  const navigationSeed = convertServerPatchToFullTree(
    currentFlightRouterState,
    flightData,
    renderedSearch
  )

  // Learn the route pattern so we can predict it for future navigations.
  // hasDynamicRewrite is false because this is a fresh navigation to an
  // unknown route - any rewrite detection happens during the traversal inside
  // discoverKnownRoute. The hasDynamicRewrite param is only set to true when
  // retrying after a tree mismatch (see dispatchRetryDueToTreeMismatch).
  const metadataVaryPath = navigationSeed.metadataVaryPath
  if (metadataVaryPath !== null) {
    discoverKnownRoute(
      now,
      url.pathname,
      null, // No pending entry
      navigationSeed.routeTree,
      metadataVaryPath,
      couldBeIntercepted,
      createHrefFromUrl(canonicalUrl),
      prerendered,
      false // hasDynamicRewrite - not a retry, rewrite detection happens during traversal
    )
  }

  return navigateToKnownRoute(
    now,
    state,
    url,
    createHrefFromUrl(canonicalUrl),
    navigationSeed,
    currentUrl,
    currentRenderedSearch,
    currentCacheNode,
    currentFlightRouterState,
    freshnessPolicy,
    nextUrl,
    shouldScroll,
    navigateType,
    debugInfo,
    // Unknown route navigations don't use route prediction - the route tree
    // came directly from the server. If a mismatch occurs during dynamic data
    // fetch, the retry handler will traverse the known route tree to mark the
    // entry as having a dynamic rewrite.
    null
  )
}

export function completeHardNavigation(
  state: AppRouterState,
  url: URL,
  navigateType: 'push' | 'replace'
): AppRouterState {
  if (isJavaScriptURLString(url.href)) {
    console.error(
      'Next.js has blocked a javascript: URL as a security precaution.'
    )
    return state
  }
  const newState: AppRouterState = {
    canonicalUrl:
      url.origin === location.origin ? createHrefFromUrl(url) : url.href,
    pushRef: {
      pendingPush: navigateType === 'push',
      mpaNavigation: true,
      preserveCustomHistoryState: false,
    },
    // TODO: None of the rest of these values are consistent with the incoming
    // navigation. We rely on the fact that AppRouter will suspend and trigger
    // a hard navigation before it accesses any of these values. But instead
    // we should trigger the hard navigation and blocking any subsequent
    // router updates without updating React.
    renderedSearch: state.renderedSearch,
    focusAndScrollRef: state.focusAndScrollRef,
    cache: state.cache,
    tree: state.tree,
    nextUrl: state.nextUrl,
    previousNextUrl: state.previousNextUrl,
    debugInfo: null,
  }
  return newState
}

export function completeSoftNavigation(
  oldState: AppRouterState,
  url: URL,
  referringNextUrl: string | null,
  tree: FlightRouterState,
  cache: CacheNode,
  renderedSearch: string,
  canonicalUrl: string,
  navigateType: 'push' | 'replace',
  shouldScroll: boolean,
  scrollableSegments: Array<FlightSegmentPath> | null,
  collectedDebugInfo: Array<unknown> | null
) {
  // The "Next-Url" is a special representation of the URL that Next.js
  // uses to implement interception routes.
  // TODO: Get rid of this extra traversal by computing this during the
  // same traversal that computes the tree itself. We should also figure out
  // what is the minimum information needed for the server to correctly
  // intercept the route.
  const changedPath = computeChangedPath(oldState.tree, tree)
  const nextUrlForNewRoute = changedPath ? changedPath : oldState.nextUrl

  // This value is stored on the state as `previousNextUrl`; the naming is
  // confusing. What it represents is the "Next-Url" header that was used to
  // fetch the incoming route. It's essentially the refererer URL, but in a
  // Next.js specific format. During refreshes, this is sent back to the server
  // instead of the current route's "Next-Url" so that the same interception
  // logic is applied as during the original navigation.
  const previousNextUrl = referringNextUrl

  // Check if the only thing that changed was the hash fragment.
  const oldUrl = new URL(oldState.canonicalUrl, url)
  const onlyHashChange =
    // We don't need to compare the origins, because client-driven
    // navigations are always same-origin.
    url.pathname === oldUrl.pathname &&
    url.search === oldUrl.search &&
    url.hash !== oldUrl.hash

  // During a hash-only change, setting scrollableSegments to an empty
  // array triggers a scroll for all new and updated segments. See
  // `ScrollAndFocusHandler` for more details.
  //
  // TODO: Given the previous comment, I don't know why shouldScroll =
  // false sets this to an empty array. Seems like an accident. I'm just
  // preserving the logic that was already here. Clean this up when we
  // move the per-segment scroll state to the CacheNode.
  const segmentPathsToScrollTo =
    onlyHashChange || !shouldScroll
      ? []
      : scrollableSegments !== null
        ? scrollableSegments
        : oldState.focusAndScrollRef.segmentPaths

  const newState: AppRouterState = {
    canonicalUrl,
    renderedSearch,
    pushRef: {
      pendingPush: navigateType === 'push',
      mpaNavigation: false,
      preserveCustomHistoryState: false,
    },
    focusAndScrollRef: {
      // TODO: We should track all the per-segment scroll state on the CacheNode
      // instead of using the paths.
      apply: shouldScroll
        ? segmentPathsToScrollTo !== null
          ? true
          : oldState.focusAndScrollRef.apply
        : oldState.focusAndScrollRef.apply,
      onlyHashChange,
      hashFragment:
        // Remove leading # and decode hash to make non-latin hashes work.
        //
        // Empty hash should trigger default behavior of scrolling layout into
        // view. #top is handled in layout-router.
        //
        // Refer to `ScrollAndFocusHandler` for details on how this is used.
        shouldScroll && url.hash !== ''
          ? decodeURIComponent(url.hash.slice(1))
          : oldState.focusAndScrollRef.hashFragment,
      segmentPaths: segmentPathsToScrollTo,
    },
    cache,
    tree,
    nextUrl: nextUrlForNewRoute,
    previousNextUrl,
    debugInfo: collectedDebugInfo,
  }
  return newState
}

export function completeTraverseNavigation(
  state: AppRouterState,
  url: URL,
  renderedSearch: string,
  cache: CacheNode,
  tree: FlightRouterState,
  nextUrl: string | null
) {
  return {
    // Set canonical url
    canonicalUrl: createHrefFromUrl(url),
    renderedSearch,
    pushRef: {
      pendingPush: false,
      mpaNavigation: false,
      // Ensures that the custom history state that was set is preserved when applying this update.
      preserveCustomHistoryState: true,
    },
    focusAndScrollRef: state.focusAndScrollRef,
    cache,
    // Restore provided tree
    tree,
    nextUrl,
    // TODO: We need to restore previousNextUrl, too, which represents the
    // Next-Url that was used to fetch the data. Anywhere we fetch using the
    // canonical URL, there should be a corresponding Next-Url.
    previousNextUrl: null,
    debugInfo: null,
  }
}

// TODO: The rest of this file is related to converting the server response into
// the data structures used by the client. Probably should move to a
// separate module.

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
    null,
  ]

  return {
    tree: clonedTree,
    data: clonedSeedData,
  }
}

/**
 * Helper for the Instant Navigation Testing API. If the navigation lock is
 * active, schedules a prefetch task, waits for it to complete, and navigates
 * using the prefetched route tree.
 *
 * Returns the new router state if navigation succeeded via prefetch, or null
 * if the lock isn't active or the prefetch failed (caller should fall through
 * to the normal unknown route path).
 *
 * Not exposed in production builds by default.
 */
async function tryNavigateUsingTestingAPIPrefetch(
  state: AppRouterState,
  url: URL,
  currentUrl: URL,
  currentRenderedSearch: string,
  nextUrl: string | null,
  currentCacheNode: CacheNode | null,
  currentFlightRouterState: FlightRouterState,
  freshnessPolicy: FreshnessPolicy,
  shouldScroll: boolean,
  navigateType: 'push' | 'replace'
): Promise<AppRouterState | null> {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    // Lazy require to ensure dead code elimination
    const { isNavigationLocked } =
      require('./navigation-testing-lock') as typeof import('./navigation-testing-lock')
    if (!isNavigationLocked()) {
      return null
    }

    // Use the link's fetch strategy so the test behavior matches what would
    // happen if the route had been prefetched before navigation
    const link = getLinkForCurrentNavigation()
    const fetchStrategy = link !== null ? link.fetchStrategy : FetchStrategy.PPR

    const cacheKey = createCacheKey(url.href, nextUrl)
    const { promise, resolve } = Promise.withResolvers<void>()

    schedulePrefetchTask(
      cacheKey,
      currentFlightRouterState,
      fetchStrategy,
      PrefetchPriority.Default,
      null, // onInvalidate
      resolve // _onComplete callback
    )

    await promise

    // Re-read from cache (should now be populated)
    const now = Date.now()
    const route = readRouteCacheEntry(now, cacheKey)
    if (route !== null && route.status === EntryStatus.Fulfilled) {
      return navigateUsingPrefetchedRouteTree(
        now,
        state,
        url,
        currentUrl,
        currentRenderedSearch,
        nextUrl,
        currentCacheNode,
        currentFlightRouterState,
        freshnessPolicy,
        shouldScroll,
        navigateType,
        route
      )
    }

    // Prefetch failed - fall through to normal unknown route path. This is fine
    // because the lock will still be held, and waitForNavigationLockIfActive()
    // in the dynamic data path will block until the lock is released.
    return null
  }
  return null
}
