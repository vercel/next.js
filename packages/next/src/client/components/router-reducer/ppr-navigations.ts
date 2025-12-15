import type {
  CacheNodeSeedData,
  FlightRouterState,
  FlightSegmentPath,
  Segment,
} from '../../../shared/lib/app-router-types'
import type {
  CacheNode,
  ChildSegmentMap,
  ReadyCacheNode,
} from '../../../shared/lib/app-router-types'
import type {
  HeadData,
  LoadingModuleData,
} from '../../../shared/lib/app-router-types'
import {
  DEFAULT_SEGMENT_KEY,
  NOT_FOUND_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import { matchSegment } from '../match-segments'
import { createHrefFromUrl } from './create-href-from-url'
import { createRouterCacheKey } from './create-router-cache-key'
import {
  fetchServerResponse,
  type FetchServerResponseResult,
} from './fetch-server-response'
import { isNavigatingToNewRootLayout } from './is-navigating-to-new-root-layout'
import { DYNAMIC_STALETIME_MS } from './reducers/navigate-reducer'

// This is yet another tree type that is used to track pending promises that
// need to be fulfilled once the dynamic data is received. The terminal nodes of
// this tree represent the new Cache Node trees that were created during this
// request. We can't use the Cache Node tree or Route State tree directly
// because those include reused nodes, too. This tree is discarded as soon as
// the navigation response is received.
export type NavigationTask = {
  // The router state that corresponds to the tree that this Task represents.
  route: FlightRouterState
  // The CacheNode that corresponds to the tree that this Task represents.
  node: CacheNode
  // The tree sent to the server during the dynamic request. If all the segments
  // are static, then this will be null, and no server request is required.
  // Otherwise, this is the same as `route`, except with the `refetch` marker
  // set on the top-most segment that needs to be fetched.
  dynamicRequestTree: FlightRouterState | null
  // The URL that should be used to fetch the dynamic data. This is only set
  // when the segment cannot be refetched from the current route, because it's
  // part of a "default" parallel slot that was reused during a navigation.
  refreshUrl: string | null
  children: Map<string, NavigationTask> | null
}

export const enum FreshnessPolicy {
  Default,
  HistoryTraversal,
  RefreshAll,
}

export type NavigationRequestAccumulation = {
  scrollableSegments: Array<FlightSegmentPath> | null
  separateRefreshUrls: Set<string> | null
}

// Creates a new Cache Node tree (i.e. copy-on-write) that represents the
// optimistic result of a navigation, using both the current Cache Node tree and
// data that was prefetched prior to navigation.
//
// At the moment we call this function, we haven't yet received the navigation
// response from the server. It could send back something completely different
// from the tree that was prefetched — due to rewrites, default routes, parallel
// routes, etc.
//
// But in most cases, it will return the same tree that we prefetched, just with
// the dynamic holes filled in. So we optimistically assume this will happen,
// and accept that the real result could be arbitrarily different.
//
// We'll reuse anything that was already in the previous tree, since that's what
// the server does.
//
// New segments (ones that don't appear in the old tree) are assigned an
// unresolved promise. The data for these promises will be fulfilled later, when
// the navigation response is received.
//
// The tree can be rendered immediately after it is created (that's why this is
// a synchronous function). Any new trees that do not have prefetch data will
// suspend during rendering, until the dynamic data streams in.
//
// Returns a Task object, which contains both the updated Cache Node and a path
// to the pending subtrees that need to be resolved by the navigation response.
//
// A return value of `null` means there were no changes, and the previous tree
// can be reused without initiating a server request.
export function startPPRNavigation(
  navigatedAt: number,
  oldUrl: URL,
  oldCacheNode: CacheNode | null,
  oldRouterState: FlightRouterState,
  newRouterState: FlightRouterState,
  freshness: FreshnessPolicy,
  seedData: CacheNodeSeedData | null,
  seedHead: HeadData | null,
  prefetchData: CacheNodeSeedData | null,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  isSamePageNavigation: boolean,
  accumulation: NavigationRequestAccumulation
): NavigationTask | null {
  const didFindRootLayout = false
  const parentNeedsDynamicRequest = false
  const parentRefreshUrl = null
  return updateCacheNodeOnNavigation(
    navigatedAt,
    oldUrl,
    oldCacheNode !== null ? oldCacheNode : undefined,
    oldRouterState,
    newRouterState,
    freshness,
    didFindRootLayout,
    seedData,
    seedHead,
    prefetchData,
    prefetchHead,
    isPrefetchHeadPartial,
    isSamePageNavigation,
    null,
    null,
    parentNeedsDynamicRequest,
    parentRefreshUrl,
    accumulation
  )
}

function updateCacheNodeOnNavigation(
  navigatedAt: number,
  oldUrl: URL,
  oldCacheNode: CacheNode | void,
  oldRouterState: FlightRouterState,
  newRouterState: FlightRouterState,
  freshness: FreshnessPolicy,
  didFindRootLayout: boolean,
  seedData: CacheNodeSeedData | null,
  seedHead: HeadData | null,
  prefetchData: CacheNodeSeedData | null,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  isSamePageNavigation: boolean,
  parentSegmentPath: FlightSegmentPath | null,
  parentParallelRouteKey: string | null,
  parentNeedsDynamicRequest: boolean,
  parentRefreshUrl: string | null,
  accumulation: NavigationRequestAccumulation
): NavigationTask | null {
  // Check if this segment matches the one in the previous route.
  const oldSegment = oldRouterState[0]
  const newSegment = newRouterState[0]
  if (!matchSegment(newSegment, oldSegment)) {
    // This segment does not match the previous route. We're now entering the
    // new part of the target route. Switch to the "create" path.
    if (
      // Check if the route tree changed before we reached a layout. (The
      // highest-level layout in a route tree is referred to as the "root"
      // layout.) This could mean that we're navigating between two different
      // root layouts. When this happens, we perform a full-page (MPA-style)
      // navigation.
      //
      // However, the algorithm for deciding where to start rendering a route
      // (i.e. the one performed in order to reach this function) is stricter
      // than the one used to detect a change in the root layout. So just
      // because we're re-rendering a segment outside of the root layout does
      // not mean we should trigger a full-page navigation.
      //
      // Specifically, we handle dynamic parameters differently: two segments
      // are considered the same even if their parameter values are different.
      //
      // Refer to isNavigatingToNewRootLayout for details.
      //
      // Note that we only have to perform this extra traversal if we didn't
      // already discover a root layout in the part of the tree that is
      // unchanged. We also only need to compare the subtree that is not
      // shared. In the common case, this branch is skipped completely.
      (!didFindRootLayout &&
        isNavigatingToNewRootLayout(oldRouterState, newRouterState)) ||
      // The global Not Found route (app/global-not-found.tsx) is a special
      // case, because it acts like a root layout, but in the router tree, it
      // is rendered in the same position as app/layout.tsx.
      //
      // Any navigation to the global Not Found route should trigger a
      // full-page navigation.
      //
      // TODO: We should probably model this by changing the key of the root
      // segment when this happens. Then the root layout check would work
      // as expected, without a special case.
      newSegment === NOT_FOUND_SEGMENT_KEY
    ) {
      return null
    }
    if (parentSegmentPath === null || parentParallelRouteKey === null) {
      // The root should never mismatch. If it does, it suggests an internal
      // Next.js error, or a malformed server response. Trigger a full-
      // page navigation.
      return null
    }
    return createCacheNodeOnNavigation(
      navigatedAt,
      newRouterState,
      oldCacheNode,
      freshness,
      seedData,
      seedHead,
      prefetchData,
      prefetchHead,
      isPrefetchHeadPartial,
      parentSegmentPath,
      parentParallelRouteKey,
      parentNeedsDynamicRequest,
      accumulation
    )
  }

  // TODO: The segment paths are tracked so that LayoutRouter knows which
  // segments to scroll to after a navigation. But we should just mark this
  // information on the CacheNode directly. It used to be necessary to do this
  // separately because CacheNodes were created lazily during render, not when
  // rather than when creating the route tree.
  const segmentPath =
    parentParallelRouteKey !== null && parentSegmentPath !== null
      ? parentSegmentPath.concat([parentParallelRouteKey, newSegment])
      : // NOTE: The root segment is intentionally omitted from the segment path
        []

  const newRouterStateChildren = newRouterState[1]
  const oldRouterStateChildren = oldRouterState[1]
  const seedDataChildren = seedData !== null ? seedData[1] : null
  const prefetchDataChildren = prefetchData !== null ? prefetchData[1] : null

  // We're currently traversing the part of the tree that was also part of
  // the previous route. If we discover a root layout, then we don't need to
  // trigger an MPA navigation.
  const isRootLayout = newRouterState[4] === true
  const childDidFindRootLayout = didFindRootLayout || isRootLayout

  const oldParallelRoutes =
    oldCacheNode !== undefined ? oldCacheNode.parallelRoutes : undefined

  // Clone the current set of segment children, even if they aren't active in
  // the new tree.
  // TODO: We currently retain all the inactive segments indefinitely, until
  // there's an explicit refresh, or a parent layout is lazily refreshed. We
  // rely on this for popstate navigations, which update the Router State Tree
  // but do not eagerly perform a data fetch, because they expect the segment
  // data to already be in the Cache Node tree. For highly static sites that
  // are mostly read-only, this may happen only rarely, causing memory to
  // leak. We should figure out a better model for the lifetime of inactive
  // segments, so we can maintain instant back/forward navigations without
  // leaking memory indefinitely.
  let shouldDropSiblingCaches: boolean = false
  let shouldRefreshDynamicData: boolean = false
  switch (freshness) {
    case FreshnessPolicy.Default:
    case FreshnessPolicy.HistoryTraversal:
      // We should never drop dynamic data in shared layouts, except during
      // a refresh.
      shouldDropSiblingCaches = false
      shouldRefreshDynamicData = false
      break
    case FreshnessPolicy.RefreshAll:
      shouldDropSiblingCaches = true
      shouldRefreshDynamicData = true
      break
    default:
      freshness satisfies never
      break
  }
  const newParallelRoutes = new Map(
    shouldDropSiblingCaches ? undefined : oldParallelRoutes
  )

  // TODO: We're not consistent about how we do this check. Some places
  // check if the segment starts with PAGE_SEGMENT_KEY, but most seem to
  // check if there any any children, which is why I'm doing it here. We
  // should probably encode an empty children set as `null` though. Either
  // way, we should update all the checks to be consistent.
  const isLeafSegment = Object.keys(newRouterStateChildren).length === 0

  // Get the data for this segment. Since it was part of the previous route,
  // usually we just clone the data from the old CacheNode. However, during a
  // refresh or a revalidation, there won't be any existing CacheNode. So we
  // may need to consult the prefetch cache, like we would for a new segment.
  let newCacheNode: ReadyCacheNode
  let needsDynamicRequest: boolean
  if (
    oldCacheNode !== undefined &&
    !shouldRefreshDynamicData &&
    // During a same-page navigation, we always refetch the page segments
    !(isLeafSegment && isSamePageNavigation)
  ) {
    // Reuse the existing CacheNode
    const dropPrefetchRsc = false
    newCacheNode = reuseDynamicCacheNode(
      dropPrefetchRsc,
      oldCacheNode,
      newParallelRoutes
    )
    needsDynamicRequest = false
  } else if (seedData !== null) {
    // If this navigation was the result of an action, then check if the
    // server sent back data in the action response. We should favor using
    // that, rather than performing a separate request. This is both better
    // for performance and it's more likely to be consistent with any
    // writes that were just performed by the action, compared to a
    // separate request.
    const seedRsc = seedData[0]
    const seedLoading = seedData[2]
    const isSeedRscPartial = false
    const isSeedHeadPartial = seedHead === null
    newCacheNode = readCacheNodeFromSeedData(
      seedRsc,
      seedLoading,
      isSeedRscPartial,
      seedHead,
      isSeedHeadPartial,
      isLeafSegment,
      newParallelRoutes,
      navigatedAt
    )
    needsDynamicRequest = isLeafSegment && isSeedHeadPartial
  } else if (prefetchData !== null) {
    // Consult the prefetch cache.
    const prefetchRsc = prefetchData[0]
    const prefetchLoading = prefetchData[2]
    const isPrefetchRSCPartial = prefetchData[3]
    newCacheNode = readCacheNodeFromSeedData(
      prefetchRsc,
      prefetchLoading,
      isPrefetchRSCPartial,
      prefetchHead,
      isPrefetchHeadPartial,
      isLeafSegment,
      newParallelRoutes,
      navigatedAt
    )
    needsDynamicRequest =
      isPrefetchRSCPartial || (isLeafSegment && isPrefetchHeadPartial)
  } else {
    // Spawn a request to fetch new data from the server.
    newCacheNode = spawnNewCacheNode(
      newParallelRoutes,
      isLeafSegment,
      navigatedAt
    )
    needsDynamicRequest = true
  }

  // During a refresh navigation, there's a special case that happens when
  // entering a "default" slot. The default slot may not be part of the
  // current route; it may have been reused from an older route. If so,
  // we need to fetch its data from the old route's URL rather than current
  // route's URL. Keep track of this as we traverse the tree.
  const href = newRouterState[2]
  const refreshUrl =
    typeof href === 'string' && newRouterState[3] === 'refresh'
      ? // This segment is not present in the current route. Track its
        // refresh URL as we continue traversing the tree.
        href
      : // Inherit the refresh URL from the parent.
        parentRefreshUrl

  // If this segment itself needs to fetch new data from the server, then by
  // definition it is being refreshed. Track its refresh URL so we know which
  // URL to request the data from.
  if (needsDynamicRequest && refreshUrl !== null) {
    accumulateRefreshUrl(accumulation, refreshUrl)
  }

  // As we diff the trees, we may sometimes modify (copy-on-write, not mutate)
  // the Route Tree that was returned by the server — for example, in the case
  // of default parallel routes, we preserve the currently active segment. To
  // avoid mutating the original tree, we clone the router state children along
  // the return path.
  let patchedRouterStateChildren: {
    [parallelRouteKey: string]: FlightRouterState
  } = {}
  let taskChildren = null

  // Most navigations require a request to fetch additional data from the
  // server, either because the data was not already prefetched, or because the
  // target route contains dynamic data that cannot be prefetched.
  //
  // However, if the target route is fully static, and it's already completely
  // loaded into the segment cache, then we can skip the server request.
  //
  // This starts off as `false`, and is set to `true` if any of the child
  // routes requires a dynamic request.
  let childNeedsDynamicRequest = false
  // As we traverse the children, we'll construct a FlightRouterState that can
  // be sent to the server to request the dynamic data. If it turns out that
  // nothing in the subtree is dynamic (i.e. childNeedsDynamicRequest is false
  // at the end), then this will be discarded.
  // TODO: We can probably optimize the format of this data structure to only
  // include paths that are dynamic. Instead of reusing the
  // FlightRouterState type.
  let dynamicRequestTreeChildren: {
    [parallelRouteKey: string]: FlightRouterState
  } = {}

  for (let parallelRouteKey in newRouterStateChildren) {
    let newRouterStateChild: FlightRouterState =
      newRouterStateChildren[parallelRouteKey]
    const oldRouterStateChild: FlightRouterState | void =
      oldRouterStateChildren[parallelRouteKey]
    if (oldRouterStateChild === undefined) {
      // This should never happen, but if it does, it suggests a malformed
      // server response. Trigger a full-page navigation.
      return null
    }
    const oldSegmentMapChild =
      oldParallelRoutes !== undefined
        ? oldParallelRoutes.get(parallelRouteKey)
        : undefined

    let seedDataChild: CacheNodeSeedData | void | null =
      seedDataChildren !== null ? seedDataChildren[parallelRouteKey] : null
    let prefetchDataChild: CacheNodeSeedData | void | null =
      prefetchDataChildren !== null
        ? prefetchDataChildren[parallelRouteKey]
        : null

    let newSegmentChild = newRouterStateChild[0]
    let seedHeadChild = seedHead
    let prefetchHeadChild = prefetchHead
    let isPrefetchHeadPartialChild = isPrefetchHeadPartial
    if (newSegmentChild === DEFAULT_SEGMENT_KEY) {
      // This is a "default" segment. These are never sent by the server during
      // a soft navigation; instead, the client reuses whatever segment was
      // already active in that slot on the previous route.
      newRouterStateChild = reuseActiveSegmentInDefaultSlot(
        oldUrl,
        oldRouterStateChild
      )
      newSegmentChild = newRouterStateChild[0]

      // Since we're switching to a different route tree, these are no
      // longer valid, because they correspond to the outer tree.
      seedDataChild = null
      seedHeadChild = null
      prefetchDataChild = null
      prefetchHeadChild = null
      isPrefetchHeadPartialChild = false
    }

    const newSegmentKeyChild = createRouterCacheKey(newSegmentChild)
    const oldCacheNodeChild =
      oldSegmentMapChild !== undefined
        ? oldSegmentMapChild.get(newSegmentKeyChild)
        : undefined

    const taskChild = updateCacheNodeOnNavigation(
      navigatedAt,
      oldUrl,
      oldCacheNodeChild,
      oldRouterStateChild,
      newRouterStateChild,
      freshness,
      childDidFindRootLayout,
      seedDataChild ?? null,
      seedHeadChild,
      prefetchDataChild ?? null,
      prefetchHeadChild,
      isPrefetchHeadPartialChild,
      isSamePageNavigation,
      segmentPath,
      parallelRouteKey,
      parentNeedsDynamicRequest || needsDynamicRequest,
      refreshUrl,
      accumulation
    )

    if (taskChild === null) {
      // One of the child tasks discovered a change to the root layout.
      // Immediately unwind from this recursive traversal. This will trigger a
      // full-page navigation.
      return null
    }

    // Recursively propagate up the child tasks.
    if (taskChildren === null) {
      taskChildren = new Map()
    }
    taskChildren.set(parallelRouteKey, taskChild)
    const newCacheNodeChild = taskChild.node
    if (newCacheNodeChild !== null) {
      const newSegmentMapChild: ChildSegmentMap = new Map(
        shouldDropSiblingCaches ? undefined : oldSegmentMapChild
      )
      newSegmentMapChild.set(newSegmentKeyChild, newCacheNodeChild)
      newParallelRoutes.set(parallelRouteKey, newSegmentMapChild)
    }

    // The child tree's route state may be different from the prefetched
    // route sent by the server. We need to clone it as we traverse back up
    // the tree.
    const taskChildRoute = taskChild.route
    patchedRouterStateChildren[parallelRouteKey] = taskChildRoute

    const dynamicRequestTreeChild = taskChild.dynamicRequestTree
    if (dynamicRequestTreeChild !== null) {
      // Something in the child tree is dynamic.
      childNeedsDynamicRequest = true
      dynamicRequestTreeChildren[parallelRouteKey] = dynamicRequestTreeChild
    } else {
      dynamicRequestTreeChildren[parallelRouteKey] = taskChildRoute
    }
  }

  return {
    route: patchRouterStateWithNewChildren(
      newRouterState,
      patchedRouterStateChildren
    ),
    node: newCacheNode,
    dynamicRequestTree: createDynamicRequestTree(
      newRouterState,
      dynamicRequestTreeChildren,
      needsDynamicRequest,
      childNeedsDynamicRequest,
      parentNeedsDynamicRequest
    ),
    refreshUrl,
    // NavigationTasks only have children if neither itself nor any of its
    // parents require a dynamic request. When writing dynamic data into the
    // tree, we can skip over any tasks that have children.
    // TODO: This is probably an unncessary optimization. The task tree only
    // lives for as long as the navigation request, anyway.
    children:
      parentNeedsDynamicRequest || needsDynamicRequest ? null : taskChildren,
  }
}

function createCacheNodeOnNavigation(
  navigatedAt: number,
  newRouterState: FlightRouterState,
  oldCacheNode: CacheNode | void,
  freshness: FreshnessPolicy,
  seedData: CacheNodeSeedData | null,
  seedHead: HeadData | null,
  prefetchData: CacheNodeSeedData | null,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  parentSegmentPath: FlightSegmentPath,
  parentParallelRouteKey: string,
  parentNeedsDynamicRequest: boolean,
  accumulation: NavigationRequestAccumulation
): NavigationTask {
  // Same traversal as updateCacheNodeNavigation, but simpler. We switch to this
  // path once we reach the part of the tree that was not in the previous route.
  // We don't need to diff against the old tree, we just need to create a new
  // one. We also don't need to worry about any refresh-related logic.
  //
  // For the most part, this is a subset of updateCacheNodeOnNavigation, so any
  // change that happens in this function likely needs to be applied to that
  // one, too. However there are some places where the behavior intentionally
  // diverges, which is why we keep them separate.

  const newSegment = newRouterState[0]
  const segmentPath = parentSegmentPath.concat([
    parentParallelRouteKey,
    newSegment,
  ])

  const newRouterStateChildren = newRouterState[1]
  const prefetchDataChildren = prefetchData !== null ? prefetchData[1] : null
  const seedDataChildren = seedData !== null ? seedData[1] : null
  const oldParallelRoutes =
    oldCacheNode !== undefined ? oldCacheNode.parallelRoutes : undefined

  let shouldDropSiblingCaches: boolean = false
  let shouldRefreshDynamicData: boolean = false
  let dropPrefetchRsc: boolean = false
  switch (freshness) {
    case FreshnessPolicy.Default:
      // We should never drop dynamic data in sibling caches except during
      // a refresh.
      shouldDropSiblingCaches = false

      // Only reuse the dynamic data if experimental.staleTimes.dynamic config
      // is set, and the data is not stale. (This is not a recommended API with
      // Cache Components, but it's supported for backwards compatibility. Use
      // cacheLife instead.)
      //
      // DYNAMIC_STALETIME_MS defaults to 0, but it can be increased.
      shouldRefreshDynamicData =
        oldCacheNode === undefined ||
        navigatedAt - oldCacheNode.navigatedAt >= DYNAMIC_STALETIME_MS

      dropPrefetchRsc = false
      break
    case FreshnessPolicy.HistoryTraversal:
      // During back/forward navigations, we reuse the dynamic data regardless
      // of how stale it may be.
      shouldRefreshDynamicData = false
      shouldRefreshDynamicData = false

      // Only show prefetched data if the dynamic data is still pending. This
      // avoids a flash back to the prefetch state in a case where it's highly
      // likely to have already streamed in.
      //
      // Tehnically, what we're actually checking is whether the dynamic network
      // response was received. But since it's a streaming response, this does
      // not mean that all the dynamic data has fully streamed in. It just means
      // that _some_ of the dynamic data was received. But as a heuristic, we
      // assume that the rest dynamic data will stream in quickly, so it's still
      // better to skip the prefetch state.
      if (oldCacheNode !== undefined) {
        const oldRsc = oldCacheNode.rsc
        const oldRscDidResolve =
          !isDeferredRsc(oldRsc) || oldRsc.status !== 'pending'
        dropPrefetchRsc = oldRscDidResolve
      } else {
        dropPrefetchRsc = false
      }
      break
    case FreshnessPolicy.RefreshAll:
      // Drop all dynamic data.
      shouldRefreshDynamicData = true
      shouldDropSiblingCaches = true
      dropPrefetchRsc = false
      break
    default:
      freshness satisfies never
      break
  }

  const newParallelRoutes = new Map(
    shouldDropSiblingCaches ? undefined : oldParallelRoutes
  )
  const isLeafSegment = Object.keys(newRouterStateChildren).length === 0

  if (isLeafSegment) {
    // The segment path of every leaf segment (i.e. page) is collected into
    // a result array. This is used by the LayoutRouter to scroll to ensure that
    // new pages are visible after a navigation.
    //
    // This only happens for new pages, not for refreshed pages.
    //
    // TODO: We should use a string to represent the segment path instead of
    // an array. We already use a string representation for the path when
    // accessing the Segment Cache, so we can use the same one.
    if (accumulation.scrollableSegments === null) {
      accumulation.scrollableSegments = []
    }
    accumulation.scrollableSegments.push(segmentPath)
  }

  let newCacheNode: ReadyCacheNode
  let needsDynamicRequest: boolean
  if (!shouldRefreshDynamicData && oldCacheNode !== undefined) {
    // Reuse the existing CacheNode
    newCacheNode = reuseDynamicCacheNode(
      dropPrefetchRsc,
      oldCacheNode,
      newParallelRoutes
    )
    needsDynamicRequest = false
  } else if (seedData !== null) {
    // If this navigation was the result of an action, then check if the
    // server sent back data in the action response. We should favor using
    // that, rather than performing a separate request. This is both better
    // for performance and it's more likely to be consistent with any
    // writes that were just performed by the action, compared to a
    // separate request.
    const seedRsc = seedData[0]
    const seedLoading = seedData[2]
    const isSeedRscPartial = false
    const isSeedHeadPartial = seedHead === null
    newCacheNode = readCacheNodeFromSeedData(
      seedRsc,
      seedLoading,
      isSeedRscPartial,
      seedHead,
      isSeedHeadPartial,
      isLeafSegment,
      newParallelRoutes,
      navigatedAt
    )
    needsDynamicRequest = isLeafSegment && isSeedHeadPartial
  } else if (prefetchData !== null) {
    // Consult the prefetch cache.
    const prefetchRsc = prefetchData[0]
    const prefetchLoading = prefetchData[2]
    const isPrefetchRSCPartial = prefetchData[3]
    newCacheNode = readCacheNodeFromSeedData(
      prefetchRsc,
      prefetchLoading,
      isPrefetchRSCPartial,
      prefetchHead,
      isPrefetchHeadPartial,
      isLeafSegment,
      newParallelRoutes,
      navigatedAt
    )
    needsDynamicRequest =
      isPrefetchRSCPartial || (isLeafSegment && isPrefetchHeadPartial)
  } else {
    // Spawn a request to fetch new data from the server.
    newCacheNode = spawnNewCacheNode(
      newParallelRoutes,
      isLeafSegment,
      navigatedAt
    )
    needsDynamicRequest = true
  }

  let patchedRouterStateChildren: {
    [parallelRouteKey: string]: FlightRouterState
  } = {}
  let taskChildren = null

  let childNeedsDynamicRequest = false
  let dynamicRequestTreeChildren: {
    [parallelRouteKey: string]: FlightRouterState
  } = {}

  for (let parallelRouteKey in newRouterStateChildren) {
    const newRouterStateChild: FlightRouterState =
      newRouterStateChildren[parallelRouteKey]
    const oldSegmentMapChild =
      oldParallelRoutes !== undefined
        ? oldParallelRoutes.get(parallelRouteKey)
        : undefined
    const seedDataChild: CacheNodeSeedData | void | null =
      seedDataChildren !== null ? seedDataChildren[parallelRouteKey] : null
    const prefetchDataChild: CacheNodeSeedData | void | null =
      prefetchDataChildren !== null
        ? prefetchDataChildren[parallelRouteKey]
        : null

    const newSegmentChild = newRouterStateChild[0]
    const newSegmentKeyChild = createRouterCacheKey(newSegmentChild)

    const oldCacheNodeChild =
      oldSegmentMapChild !== undefined
        ? oldSegmentMapChild.get(newSegmentKeyChild)
        : undefined

    const taskChild = createCacheNodeOnNavigation(
      navigatedAt,
      newRouterStateChild,
      oldCacheNodeChild,
      freshness,
      seedDataChild ?? null,
      seedHead,
      prefetchDataChild ?? null,
      prefetchHead,
      isPrefetchHeadPartial,
      segmentPath,
      parallelRouteKey,
      parentNeedsDynamicRequest || needsDynamicRequest,
      accumulation
    )

    if (taskChildren === null) {
      taskChildren = new Map()
    }
    taskChildren.set(parallelRouteKey, taskChild)
    const newCacheNodeChild = taskChild.node
    if (newCacheNodeChild !== null) {
      const newSegmentMapChild: ChildSegmentMap = new Map(
        shouldDropSiblingCaches ? undefined : oldSegmentMapChild
      )
      newSegmentMapChild.set(newSegmentKeyChild, newCacheNodeChild)
      newParallelRoutes.set(parallelRouteKey, newSegmentMapChild)
    }

    const taskChildRoute = taskChild.route
    patchedRouterStateChildren[parallelRouteKey] = taskChildRoute

    const dynamicRequestTreeChild = taskChild.dynamicRequestTree
    if (dynamicRequestTreeChild !== null) {
      childNeedsDynamicRequest = true
      dynamicRequestTreeChildren[parallelRouteKey] = dynamicRequestTreeChild
    } else {
      dynamicRequestTreeChildren[parallelRouteKey] = taskChildRoute
    }
  }

  return {
    route: patchRouterStateWithNewChildren(
      newRouterState,
      patchedRouterStateChildren
    ),
    node: newCacheNode,
    dynamicRequestTree: createDynamicRequestTree(
      newRouterState,
      dynamicRequestTreeChildren,
      needsDynamicRequest,
      childNeedsDynamicRequest,
      parentNeedsDynamicRequest
    ),
    // This route is not part of the current tree, so there's no reason to
    // track the refresh URL.
    refreshUrl: null,
    children:
      parentNeedsDynamicRequest || needsDynamicRequest ? null : taskChildren,
  }
}

function patchRouterStateWithNewChildren(
  baseRouterState: FlightRouterState,
  newChildren: { [parallelRouteKey: string]: FlightRouterState }
): FlightRouterState {
  const clone: FlightRouterState = [baseRouterState[0], newChildren]
  // Based on equivalent logic in apply-router-state-patch-to-tree, but should
  // confirm whether we need to copy all of these fields. Not sure the server
  // ever sends, e.g. the refetch marker.
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

function createDynamicRequestTree(
  newRouterState: FlightRouterState,
  dynamicRequestTreeChildren: Record<string, FlightRouterState>,
  needsDynamicRequest: boolean,
  childNeedsDynamicRequest: boolean,
  parentNeedsDynamicRequest: boolean
): FlightRouterState | null {
  // Create a FlightRouterState that instructs the server how to render the
  // requested segment.
  //
  // Or, if neither this segment nor any of the children require a new data,
  // then we return `null` to skip the request.
  let dynamicRequestTree: FlightRouterState | null = null
  if (needsDynamicRequest) {
    dynamicRequestTree = patchRouterStateWithNewChildren(
      newRouterState,
      dynamicRequestTreeChildren
    )
    // The "refetch" marker is set on the top-most segment that requires new
    // data. We can omit it if a parent was already marked.
    if (!parentNeedsDynamicRequest) {
      dynamicRequestTree[3] = 'refetch'
    }
  } else if (childNeedsDynamicRequest) {
    // This segment does not request new data, but at least one of its
    // children does.
    dynamicRequestTree = patchRouterStateWithNewChildren(
      newRouterState,
      dynamicRequestTreeChildren
    )
  } else {
    dynamicRequestTree = null
  }
  return dynamicRequestTree
}

function accumulateRefreshUrl(
  accumulation: NavigationRequestAccumulation,
  refreshUrl: string
) {
  // This is a refresh navigation, and we're inside a "default" slot that's
  // not part of the current route; it was reused from an older route. In
  // order to get fresh data for this reused route, we need to issue a
  // separate request using the old route's URL.
  //
  // Track these extra URLs in the accumulated result. Later, we'll construct
  // an appropriate request for each unique URL in the final set. The reason
  // we don't do it immediately here is so we can deduplicate multiple
  // instances of the same URL into a single request. See
  // listenForDynamicRequest for more details.
  const separateRefreshUrls = accumulation.separateRefreshUrls
  if (separateRefreshUrls === null) {
    accumulation.separateRefreshUrls = new Set([refreshUrl])
  } else {
    separateRefreshUrls.add(refreshUrl)
  }
}

function reuseActiveSegmentInDefaultSlot(
  oldUrl: URL,
  oldRouterState: FlightRouterState
): FlightRouterState {
  // This is a "default" segment. These are never sent by the server during a
  // soft navigation; instead, the client reuses whatever segment was already
  // active in that slot on the previous route. This means if we later need to
  // refresh the segment, it will have to be refetched from the previous route's
  // URL. We store it in the Flight Router State.
  //
  // TODO: We also mark the segment with a "refresh" marker but I think we can
  // get rid of that eventually by making sure we only add URLs to page segments
  // that are reused. Then the presence of the URL alone is enough.
  let reusedRouterState

  const oldRefreshMarker = oldRouterState[3]
  if (oldRefreshMarker === 'refresh') {
    // This segment was already reused from an even older route. Keep its
    // existing URL and refresh marker.
    reusedRouterState = oldRouterState
  } else {
    // This segment was not previously reused, and it's not on the new route.
    // So it must have been delivered in the old route.
    reusedRouterState = patchRouterStateWithNewChildren(
      oldRouterState,
      oldRouterState[1]
    )
    reusedRouterState[2] = createHrefFromUrl(oldUrl)
    reusedRouterState[3] = 'refresh'
  }

  return reusedRouterState
}

function reuseDynamicCacheNode(
  dropPrefetchRsc: boolean,
  existingCacheNode: CacheNode,
  parallelRoutes: Map<string, ChildSegmentMap>
): ReadyCacheNode {
  // Clone an existing CacheNode's data, with (possibly) new children.
  const cacheNode: ReadyCacheNode = {
    lazyData: null,
    rsc: existingCacheNode.rsc,
    prefetchRsc: dropPrefetchRsc ? null : existingCacheNode.prefetchRsc,
    head: existingCacheNode.head,
    prefetchHead: dropPrefetchRsc ? null : existingCacheNode.prefetchHead,
    loading: existingCacheNode.loading,

    parallelRoutes,

    // Don't update the navigatedAt timestamp, since we're reusing
    // existing data.
    navigatedAt: existingCacheNode.navigatedAt,
  }
  return cacheNode
}

function readCacheNodeFromSeedData(
  prefetchRsc: React.ReactNode,
  prefetchLoading: LoadingModuleData | Promise<LoadingModuleData>,
  isPrefetchRSCPartial: boolean,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  isPageSegment: boolean,
  parallelRoutes: Map<string, ChildSegmentMap>,
  navigatedAt: number
): ReadyCacheNode {
  // TODO: Currently this is threaded through the navigation logic using the
  // CacheNodeSeedData type, but in the future this will read directly from
  // the Segment Cache. See readRenderSnapshotFromCache.

  let rsc: React.ReactNode
  if (isPrefetchRSCPartial) {
    // The prefetched data contains dynamic holes. Create a pending promise that
    // will be fulfilled when the dynamic data is received from the server.
    rsc = createDeferredRsc()
  } else {
    // The prefetched data is complete. Use it directly.
    rsc = prefetchRsc
  }

  // If this is a page segment, also read the head.
  let resolvedPrefetchHead: HeadData | null
  let resolvedHead: HeadData | null
  if (isPageSegment) {
    resolvedPrefetchHead = prefetchHead
    if (isPrefetchHeadPartial) {
      resolvedHead = createDeferredRsc()
    } else {
      resolvedHead = prefetchHead
    }
  } else {
    resolvedPrefetchHead = null
    resolvedHead = null
  }

  const cacheNode: ReadyCacheNode = {
    lazyData: null,
    rsc,
    prefetchRsc,
    head: resolvedHead,
    prefetchHead: resolvedPrefetchHead,
    // TODO: Technically, a loading boundary could contain dynamic data. We
    // should have separate `loading` and `prefetchLoading` fields to handle
    // this, like we do for the segment data and head.
    loading: prefetchLoading,
    parallelRoutes,
    navigatedAt,
  }

  return cacheNode
}

function spawnNewCacheNode(
  parallelRoutes: Map<string, ChildSegmentMap>,
  isLeafSegment: boolean,
  navigatedAt: number
): ReadyCacheNode {
  const cacheNode: ReadyCacheNode = {
    lazyData: null,
    rsc: createDeferredRsc(),
    prefetchRsc: null,
    head: isLeafSegment ? createDeferredRsc() : null,
    prefetchHead: null,
    loading: createDeferredRsc<LoadingModuleData>(),
    parallelRoutes,
    navigatedAt,
  }
  return cacheNode
}

// Writes a dynamic server response into the tree created by
// updateCacheNodeOnNavigation. All pending promises that were spawned by the
// navigation will be resolved, either with dynamic data from the server, or
// `null` to indicate that the data is missing.
//
// A `null` value will trigger a lazy fetch during render, which will then patch
// up the tree using the same mechanism as the non-PPR implementation
// (serverPatchReducer).
//
// Usually, the server will respond with exactly the subset of data that we're
// waiting for — everything below the nearest shared layout. But technically,
// the server can return anything it wants.
//
// This does _not_ create a new tree; it modifies the existing one in place.
// Which means it must follow the Suspense rules of cache safety.
export function listenForDynamicRequest(
  url: URL,
  nextUrl: string | null,
  task: NavigationTask,
  dynamicRequestTree: FlightRouterState,
  // TODO: Rather than pass this into listenForDynamicRequest, we should seed
  // the data into the CacheNode tree during the first traversal. Similar to
  // what we will do for seeding navigations from a Server Action.
  existingDynamicRequestPromise: Promise<FetchServerResponseResult> | null,
  accumulation: NavigationRequestAccumulation
): void {
  const requestPromises = []
  const separateRefreshUrls = accumulation.separateRefreshUrls
  if (separateRefreshUrls === null) {
    // Normal case. All the data can be fetched from the same URL.
    if (existingDynamicRequestPromise !== null) {
      // A dynamic request was already initiated. This can happen if the route
      // tree was not already prefetched/cached before navigation.
      requestPromises.push(
        attachServerResponseListener(task, existingDynamicRequestPromise)
      )
    } else {
      // Initiate a new dynamic request.
      requestPromises.push(
        attachServerResponseListener(
          task,
          fetchServerResponse(url, {
            flightRouterState: dynamicRequestTree,
            nextUrl,
          })
        )
      )
    }
  } else {
    // This is a refresh navigation, and there are multiple URLs that we need to
    // request the data from. This happens when a "default" parallel route slot
    // is present in the tree, and its data cannot be fetched from the current
    // route. We need to split the combined dynamic request tree into separate
    // requests per URL.
    //
    // First construct a request tree for the main URL. This will prune away
    // the parts of the tree that are not present in the current route. (`null`
    // as the second argument is used to represent the main URL.)
    if (existingDynamicRequestPromise !== null) {
      // A dynamic request was already initiated. This can happen if the route
      // tree was not already prefetched/cached before navigation.
      requestPromises.push(
        attachServerResponseListener(task, existingDynamicRequestPromise)
      )
    } else {
      // Initiate a new dynamic request.
      // TODO: Create a scoped dynamic request tree that omits anything that
      // is not relevant to the given URL. Without doing this, the server may
      // sometimes render more data than necessary; this is not a regression
      // compared to the pre-Segment Cache implementation, though, just an
      // optimization we can make in the future.
      // const primaryDynamicRequestTree = splitTaskByURL(task, null)
      const primaryDynamicRequestTree = dynamicRequestTree
      if (primaryDynamicRequestTree !== null) {
        requestPromises.push(
          attachServerResponseListener(
            task,
            fetchServerResponse(url, {
              flightRouterState: primaryDynamicRequestTree,
              nextUrl,
            })
          )
        )
      }
    }
    // Then construct a request tree for each additional refresh URL. This will
    // prune away everything except the parts of the tree that match the
    // given refresh URL.
    const canonicalUrl = createHrefFromUrl(url)
    for (const refreshUrl of separateRefreshUrls) {
      if (refreshUrl === canonicalUrl) {
        // We already initiated a request for the this URL, above. Skip it.
        // TODO: This only happens because the main URL is not tracked as
        // part of the separateRefreshURLs set. There's probably a better way
        // to structure this so this case doesn't happen.
        continue
      }
      // TODO: Create a scoped dynamic request tree that omits anything that
      // is not relevant to the given URL. Without doing this, the server may
      // sometimes render more data than necessary; this is not a regression
      // compared to the pre-Segment Cache implementation, though, just an
      // optimization we can make in the future.
      // const scopedDynamicRequestTree = splitTaskByURL(task, refreshUrl)
      const scopedDynamicRequestTree = dynamicRequestTree
      if (scopedDynamicRequestTree !== null) {
        requestPromises.push(
          attachServerResponseListener(
            task,
            fetchServerResponse(new URL(refreshUrl, url.origin), {
              flightRouterState: scopedDynamicRequestTree,
              nextUrl,
            })
          )
        )
      }
    }
  }

  // Once we've exhausted all the data we received from the server, if there are
  // any remaining pending tasks in the tree, abort them. As a last ditch
  // effort, this will trigger the "old" fetching path (server-patch-reducer)
  // in LayoutRouter, though in the future we'll remove server-patch-reducer
  // and handle server failures using some more robust mechanism. Perhaps by
  // throwing a special offline error, or by triggering an MPA refresh.
  Promise.all(requestPromises).then(
    () => abortTask(task, null, null),
    () => abortTask(task, null, null)
  )
}

function attachServerResponseListener(
  task: NavigationTask,
  requestPromise: Promise<FetchServerResponseResult>
): Promise<void> {
  return requestPromise.then((result) => {
    if (typeof result === 'string') {
      // Happens when navigating to page in `pages` from `app`. We shouldn't
      // get here because should have already handled this during
      // the prefetch.
      return
    }
    const { flightData, debugInfo } = result
    for (const normalizedFlightData of flightData) {
      const {
        segmentPath,
        tree: serverRouterState,
        seedData: dynamicData,
        head: dynamicHead,
      } = normalizedFlightData

      if (!dynamicData) {
        // This shouldn't happen. PPR should always send back a response.
        // However, `FlightDataPath` is a shared type and the pre-PPR handling of
        // this might return null.
        continue
      }

      writeDynamicDataIntoPendingTask(
        task,
        segmentPath,
        serverRouterState,
        dynamicData,
        dynamicHead,
        debugInfo
      )
    }
  })
}

function writeDynamicDataIntoPendingTask(
  rootTask: NavigationTask,
  segmentPath: FlightSegmentPath,
  serverRouterState: FlightRouterState,
  dynamicData: CacheNodeSeedData,
  dynamicHead: HeadData,
  debugInfo: Array<any> | null
) {
  // The data sent by the server represents only a subtree of the app. We need
  // to find the part of the task tree that matches the server response, and
  // fulfill it using the dynamic data.
  //
  // segmentPath represents the parent path of subtree. It's a repeating pattern
  // of parallel route key and segment:
  //
  //   [string, Segment, string, Segment, string, Segment, ...]
  //
  // Iterate through the path and finish any tasks that match this payload.
  let task = rootTask
  for (let i = 0; i < segmentPath.length; i += 2) {
    const parallelRouteKey: string = segmentPath[i]
    const segment: Segment = segmentPath[i + 1]
    const taskChildren = task.children
    if (taskChildren !== null) {
      const taskChild = taskChildren.get(parallelRouteKey)
      if (taskChild !== undefined) {
        const taskSegment = taskChild.route[0]
        if (matchSegment(segment, taskSegment)) {
          // Found a match for this task. Keep traversing down the task tree.
          task = taskChild
          continue
        }
      }
    }
    // We didn't find a child task that matches the server data. Exit. We won't
    // abort the task, though, because a different FlightDataPath may be able to
    // fulfill it (see loop in listenForDynamicRequest). We only abort tasks
    // once we've run out of data.
    return
  }

  finishTaskUsingDynamicDataPayload(
    task,
    serverRouterState,
    dynamicData,
    dynamicHead,
    debugInfo
  )
}

function finishTaskUsingDynamicDataPayload(
  task: NavigationTask,
  serverRouterState: FlightRouterState,
  dynamicData: CacheNodeSeedData,
  dynamicHead: HeadData,
  debugInfo: Array<any> | null
) {
  if (task.dynamicRequestTree === null) {
    // Everything in this subtree is already complete. Bail out.
    return
  }

  // dynamicData may represent a larger subtree than the task. Before we can
  // finish the task, we need to line them up.
  const taskChildren = task.children
  const taskNode = task.node
  if (taskChildren === null) {
    // We've reached the leaf node of the pending task. The server data tree
    // lines up the pending Cache Node tree. We can now switch to the
    // normal algorithm.
    if (taskNode !== null) {
      finishPendingCacheNode(
        taskNode,
        task.route,
        serverRouterState,
        dynamicData,
        dynamicHead,
        debugInfo
      )
    }
    return
  }
  // The server returned more data than we need to finish the task. Skip over
  // the extra segments until we reach the leaf task node.
  const serverChildren = serverRouterState[1]
  const dynamicDataChildren = dynamicData[1]

  for (const parallelRouteKey in serverChildren) {
    const serverRouterStateChild: FlightRouterState =
      serverChildren[parallelRouteKey]
    const dynamicDataChild: CacheNodeSeedData | null | void =
      dynamicDataChildren[parallelRouteKey]

    const taskChild = taskChildren.get(parallelRouteKey)
    if (taskChild !== undefined) {
      const taskSegment = taskChild.route[0]
      if (
        matchSegment(serverRouterStateChild[0], taskSegment) &&
        dynamicDataChild !== null &&
        dynamicDataChild !== undefined
      ) {
        // Found a match for this task. Keep traversing down the task tree.
        finishTaskUsingDynamicDataPayload(
          taskChild,
          serverRouterStateChild,
          dynamicDataChild,
          dynamicHead,
          debugInfo
        )
      }
    }
  }
}

function finishPendingCacheNode(
  cacheNode: CacheNode,
  taskState: FlightRouterState,
  serverState: FlightRouterState,
  dynamicData: CacheNodeSeedData,
  dynamicHead: HeadData,
  debugInfo: Array<any> | null
): void {
  // Writes a dynamic response into an existing Cache Node tree. This does _not_
  // create a new tree, it updates the existing tree in-place. So it must follow
  // the Suspense rules of cache safety — it can resolve pending promises, but
  // it cannot overwrite existing data. It can add segments to the tree (because
  // a missing segment will cause the layout router to suspend).
  // but it cannot delete them.
  //
  // We must resolve every promise in the tree, or else it will suspend
  // indefinitely. If we did not receive data for a segment, we will resolve its
  // data promise to `null` to trigger a lazy fetch during render.
  const taskStateChildren = taskState[1]
  const serverStateChildren = serverState[1]
  const dataChildren = dynamicData[1]

  // The router state that we traverse the tree with (taskState) is the same one
  // that we used to construct the pending Cache Node tree. That way we're sure
  // to resolve all the pending promises.
  const parallelRoutes = cacheNode.parallelRoutes
  for (let parallelRouteKey in taskStateChildren) {
    const taskStateChild: FlightRouterState =
      taskStateChildren[parallelRouteKey]
    const serverStateChild: FlightRouterState | void =
      serverStateChildren[parallelRouteKey]
    const dataChild: CacheNodeSeedData | null | void =
      dataChildren[parallelRouteKey]

    const segmentMapChild = parallelRoutes.get(parallelRouteKey)
    const taskSegmentChild = taskStateChild[0]
    const taskSegmentKeyChild = createRouterCacheKey(taskSegmentChild)

    const cacheNodeChild =
      segmentMapChild !== undefined
        ? segmentMapChild.get(taskSegmentKeyChild)
        : undefined

    if (cacheNodeChild !== undefined) {
      if (
        serverStateChild !== undefined &&
        matchSegment(taskSegmentChild, serverStateChild[0]) &&
        dataChild !== undefined &&
        dataChild !== null
      ) {
        finishPendingCacheNode(
          cacheNodeChild,
          taskStateChild,
          serverStateChild,
          dataChild,
          dynamicHead,
          debugInfo
        )
      }
    }
  }

  // Use the dynamic data from the server to fulfill the deferred RSC promise
  // on the Cache Node.
  const rsc = cacheNode.rsc
  const dynamicSegmentData = dynamicData[0]
  if (rsc === null) {
    // This is a lazy cache node. We can overwrite it. This is only safe
    // because we know that the LayoutRouter suspends if `rsc` is `null`.
    cacheNode.rsc = dynamicSegmentData
  } else if (isDeferredRsc(rsc)) {
    // This is a deferred RSC promise. We can fulfill it with the data we just
    // received from the server. If it was already resolved by a different
    // navigation, then this does nothing because we can't overwrite data.
    rsc.resolve(dynamicSegmentData, debugInfo)
  } else {
    // This is not a deferred RSC promise, nor is it empty, so it must have
    // been populated by a different navigation. We must not overwrite it.
  }

  // If we navigated without a prefetch, then `loading` will be a deferred promise too.
  // Fulfill it using the dynamic response so that we can display the loading boundary.
  const loading = cacheNode.loading
  if (isDeferredRsc(loading)) {
    const dynamicLoading = dynamicData[2]
    loading.resolve(dynamicLoading, debugInfo)
  }

  // Check if this is a leaf segment. If so, it will have a `head` property with
  // a pending promise that needs to be resolved with the dynamic head from
  // the server.
  const head = cacheNode.head
  if (isDeferredRsc(head)) {
    head.resolve(dynamicHead, debugInfo)
  }
}

export function abortTask(
  task: NavigationTask,
  error: any,
  debugInfo: Array<any> | null
): void {
  const cacheNode = task.node
  if (cacheNode === null) {
    // This indicates the task is already complete.
    return
  }

  const taskChildren = task.children
  if (taskChildren === null) {
    // Reached the leaf task node. This is the root of a pending cache
    // node tree.
    abortPendingCacheNode(task.route, cacheNode, error, debugInfo)
  } else {
    // This is an intermediate task node. Keep traversing until we reach a
    // task node with no children. That will be the root of the cache node tree
    // that needs to be resolved.
    for (const taskChild of taskChildren.values()) {
      abortTask(taskChild, error, debugInfo)
    }
  }

  // Set this to null to indicate that this task is now complete.
  task.dynamicRequestTree = null
}

function abortPendingCacheNode(
  routerState: FlightRouterState,
  cacheNode: CacheNode,
  error: any,
  debugInfo: Array<any> | null
): void {
  // For every pending segment in the tree, resolve its `rsc` promise to `null`
  // to trigger a lazy fetch during render.
  //
  // Or, if an error object is provided, it will error instead.
  const routerStateChildren = routerState[1]
  const parallelRoutes = cacheNode.parallelRoutes
  for (let parallelRouteKey in routerStateChildren) {
    const routerStateChild: FlightRouterState =
      routerStateChildren[parallelRouteKey]
    const segmentMapChild = parallelRoutes.get(parallelRouteKey)
    if (segmentMapChild === undefined) {
      // This shouldn't happen because we're traversing the same tree that was
      // used to construct the cache nodes in the first place.
      continue
    }
    const segmentChild = routerStateChild[0]
    const segmentKeyChild = createRouterCacheKey(segmentChild)
    const cacheNodeChild = segmentMapChild.get(segmentKeyChild)
    if (cacheNodeChild !== undefined) {
      abortPendingCacheNode(routerStateChild, cacheNodeChild, error, debugInfo)
    } else {
      // This shouldn't happen because we're traversing the same tree that was
      // used to construct the cache nodes in the first place.
    }
  }

  const rsc = cacheNode.rsc
  if (isDeferredRsc(rsc)) {
    if (error === null) {
      // This will trigger a lazy fetch during render.
      rsc.resolve(null, debugInfo)
    } else {
      // This will trigger an error during rendering.
      rsc.reject(error, debugInfo)
    }
  }

  const loading = cacheNode.loading
  if (isDeferredRsc(loading)) {
    loading.resolve(null, debugInfo)
  }

  // Check if this is a leaf segment. If so, it will have a `head` property with
  // a pending promise that needs to be resolved. If an error was provided, we
  // will not resolve it with an error, since this is rendered at the root of
  // the app. We want the segment to error, not the entire app.
  const head = cacheNode.head
  if (isDeferredRsc(head)) {
    head.resolve(null, debugInfo)
  }
}

const DEFERRED = Symbol()

type PendingDeferredRsc<T> = Promise<T> & {
  status: 'pending'
  resolve: (value: T, debugInfo: Array<any> | null) => void
  reject: (error: any, debugInfo: Array<any> | null) => void
  tag: Symbol
  _debugInfo: Array<any>
}

type FulfilledDeferredRsc<T> = Promise<T> & {
  status: 'fulfilled'
  value: T
  resolve: (value: T, debugInfo: Array<any> | null) => void
  reject: (error: any, debugInfo: Array<any> | null) => void
  tag: Symbol
  _debugInfo: Array<any>
}

type RejectedDeferredRsc<T> = Promise<T> & {
  status: 'rejected'
  reason: any
  resolve: (value: T, debugInfo: Array<any> | null) => void
  reject: (error: any, debugInfo: Array<any> | null) => void
  tag: Symbol
  _debugInfo: Array<any>
}

type DeferredRsc<T extends React.ReactNode = React.ReactNode> =
  | PendingDeferredRsc<T>
  | FulfilledDeferredRsc<T>
  | RejectedDeferredRsc<T>

// This type exists to distinguish a DeferredRsc from a Flight promise. It's a
// compromise to avoid adding an extra field on every Cache Node, which would be
// awkward because the pre-PPR parts of codebase would need to account for it,
// too. We can remove it once type Cache Node type is more settled.
function isDeferredRsc(value: any): value is DeferredRsc {
  return value && typeof value === 'object' && value.tag === DEFERRED
}

function createDeferredRsc<
  T extends React.ReactNode = React.ReactNode,
>(): PendingDeferredRsc<T> {
  // Create an unresolved promise that represents data derived from a Flight
  // response. The promise will be resolved later as soon as we start receiving
  // data from the server, i.e. as soon as the Flight client decodes and returns
  // the top-level response object.

  // The `_debugInfo` field contains profiling information. Promises that are
  // created by Flight already have this info added by React; for any derived
  // promise created by the router, we need to transfer the Flight debug info
  // onto the derived promise.
  //
  // The debug info represents the latency between the start of the navigation
  // and the start of rendering. (It does not represent the time it takes for
  // whole stream to finish.)
  const debugInfo: Array<any> = []

  let resolve: any
  let reject: any
  const pendingRsc = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  }) as PendingDeferredRsc<T>
  pendingRsc.status = 'pending'
  pendingRsc.resolve = (value: T, responseDebugInfo: Array<any> | null) => {
    if (pendingRsc.status === 'pending') {
      const fulfilledRsc: FulfilledDeferredRsc<T> = pendingRsc as any
      fulfilledRsc.status = 'fulfilled'
      fulfilledRsc.value = value
      if (responseDebugInfo !== null) {
        // Transfer the debug info to the derived promise.
        debugInfo.push.apply(debugInfo, responseDebugInfo)
      }
      resolve(value)
    }
  }
  pendingRsc.reject = (error: any, responseDebugInfo: Array<any> | null) => {
    if (pendingRsc.status === 'pending') {
      const rejectedRsc: RejectedDeferredRsc<T> = pendingRsc as any
      rejectedRsc.status = 'rejected'
      rejectedRsc.reason = error
      if (responseDebugInfo !== null) {
        // Transfer the debug info to the derived promise.
        debugInfo.push.apply(debugInfo, responseDebugInfo)
      }
      reject(error)
    }
  }
  pendingRsc.tag = DEFERRED
  pendingRsc._debugInfo = debugInfo

  return pendingRsc
}
