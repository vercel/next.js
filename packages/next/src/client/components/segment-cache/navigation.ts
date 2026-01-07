import type {
  CacheNodeSeedData,
  FlightRouterState,
  FlightSegmentPath,
} from '../../../shared/lib/app-router-types'
import type { CacheNode } from '../../../shared/lib/app-router-types'
import type { HeadData } from '../../../shared/lib/app-router-types'
import type { NormalizedFlightData } from '../../flight-data-helpers'
import {
  startPPRNavigation,
  spawnDynamicRequests,
  type FreshnessPolicy,
  type NavigationRequestAccumulation,
} from '../router-reducer/ppr-navigations'
import { createHrefFromUrl } from '../router-reducer/create-href-from-url'
import {
  convertRootFlightRouterStateToRouteTree,
  type RouteTree,
} from './cache'
import type { NormalizedSearch } from './cache-key'
import type { PageVaryPath } from './vary-path'
import type { AppRouterState } from '../router-reducer/router-reducer-types'
import type { RouterTask } from '../router-reducer/reducers/router-task'
import { computeChangedPath } from '../router-reducer/compute-changed-path'
import { isJavaScriptURLString } from '../../lib/javascript-url'

// TODO: Inline this module into router-task.ts. The NavigationSeed stuff at the
// bottom can perhaps move into its own module, or to flight-data-helpers.ts.

export function navigateToKnownRoute(
  now: number,
  baseState: AppRouterState,
  routerTask: RouterTask,
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
  navigateType: NavigationType,
  debugInfo: Array<unknown> | null
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
  const cacheNodeTask = startPPRNavigation(
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
  if (cacheNodeTask !== null) {
    spawnDynamicRequests(
      cacheNodeTask,
      routerTask,
      url,
      nextUrl,
      freshnessPolicy,
      accumulation
    )
    return completeSoftNavigation(
      baseState,
      url,
      nextUrl,
      cacheNodeTask.route,
      cacheNodeTask.node,
      navigationSeed.renderedSearch,
      canonicalUrl,
      navigateType,
      shouldScroll,
      accumulation.scrollableSegments,
      debugInfo
    )
  }
  // Could not perform a SPA navigation. Revert to a full-page (MPA) navigation.
  return completeHardNavigation(baseState, url, navigateType)
}

export function completeHardNavigation(
  state: AppRouterState,
  url: URL,
  navigateType: NavigationType
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
  navigateType: NavigationType,
  shouldScroll: boolean,
  scrollableSegments: Array<FlightSegmentPath> | null,
  collectedDebugInfo: Array<unknown> | null
) {
  if (navigateType === 'traverse') {
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
      focusAndScrollRef: oldState.focusAndScrollRef,
      cache,
      // Restore provided tree
      tree,
      nextUrl: referringNextUrl,
      // TODO: We need to restore previousNextUrl, too, which represents the
      // Next-Url that was used to fetch the data. Anywhere we fetch using the
      // canonical URL, there should be a corresponding Next-Url.
      previousNextUrl: null,
      debugInfo: null,
    }
  }

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
        ? scrollableSegments !== null
          ? true
          : oldState.focusAndScrollRef.apply
        : false,
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
      segmentPaths:
        // During a hash-only change, setting scrollableSegmeths to an empty
        // array triggers a scroll for all new and updated segments. See
        // `ScrollAndFocusHandler` for more details.
        //
        // TODO: Given the previous comment, I don't know why shouldScroll =
        // false sets this to an empty array. Seems like an accident. I'm just
        // preserving the logic that was already here. Clean this up when we
        // move the per-segment scroll state to the CacheNode.
        onlyHashChange || !shouldScroll
          ? []
          : scrollableSegments !== null
            ? scrollableSegments
            : oldState.focusAndScrollRef.segmentPaths,
    },
    cache,
    tree,
    nextUrl: nextUrlForNewRoute,
    previousNextUrl,
    debugInfo: collectedDebugInfo,
  }
  return newState
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
  ]

  return {
    tree: clonedTree,
    data: clonedSeedData,
  }
}
