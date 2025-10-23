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
import { DEFAULT_SEGMENT_KEY } from '../../../shared/lib/segment'
import { matchSegment } from '../match-segments'
import { createHrefFromUrl } from './create-href-from-url'
import { createRouterCacheKey } from './create-router-cache-key'
import type { FetchServerResponseResult } from './fetch-server-response'
import { isNavigatingToNewRootLayout } from './is-navigating-to-new-root-layout'
import { DYNAMIC_STALETIME_MS } from './reducers/navigate-reducer'

// This is yet another tree type that is used to track pending promises that
// need to be fulfilled once the dynamic data is received. The terminal nodes of
// this tree represent the new Cache Node trees that were created during this
// request. We can't use the Cache Node tree or Route State tree directly
// because those include reused nodes, too. This tree is discarded as soon as
// the navigation response is received.
type SPANavigationTask = {
  // The router state that corresponds to the tree that this Task represents.
  route: FlightRouterState
  // The CacheNode that corresponds to the tree that this Task represents. If
  // `children` is null (i.e. if this is a terminal task node), then `node`
  // represents a brand new Cache Node tree, which way or may not need to be
  // filled with dynamic data from the server.
  node: CacheNode | null
  // The tree sent to the server during the dynamic request. This is the
  // same as `route`, except with the `refetch` marker set on dynamic segments.
  // If all the segments are static, then this will be null, and no server
  // request is required.
  dynamicRequestTree: FlightRouterState | null
  children: Map<string, SPANavigationTask> | null
}

// A special type used to bail out and trigger a full-page navigation.
type MPANavigationTask = {
  // MPA tasks are distinguised from SPA tasks by having a null `route`.
  route: null
  node: null
  dynamicRequestTree: null
  children: null
}

const MPA_NAVIGATION_TASK: MPANavigationTask = {
  route: null,
  node: null,
  dynamicRequestTree: null,
  children: null,
}

export type Task = SPANavigationTask | MPANavigationTask

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
  oldCacheNode: CacheNode,
  oldRouterState: FlightRouterState,
  newRouterState: FlightRouterState,
  prefetchData: CacheNodeSeedData | null,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  isSamePageNavigation: boolean,
  scrollableSegmentsResult: Array<FlightSegmentPath>
): Task | null {
  const segmentPath: Array<FlightSegmentPath> = []
  return updateCacheNodeOnNavigation(
    navigatedAt,
    oldUrl,
    oldCacheNode,
    oldRouterState,
    newRouterState,
    false,
    prefetchData,
    prefetchHead,
    isPrefetchHeadPartial,
    isSamePageNavigation,
    segmentPath,
    scrollableSegmentsResult
  )
}

function updateCacheNodeOnNavigation(
  navigatedAt: number,
  oldUrl: URL,
  oldCacheNode: CacheNode,
  oldRouterState: FlightRouterState,
  newRouterState: FlightRouterState,
  didFindRootLayout: boolean,
  prefetchData: CacheNodeSeedData | null,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  isSamePageNavigation: boolean,
  segmentPath: FlightSegmentPath,
  scrollableSegmentsResult: Array<FlightSegmentPath>
): Task | null {
  // Diff the old and new trees to reuse the shared layouts.
  const oldRouterStateChildren = oldRouterState[1]
  const newRouterStateChildren = newRouterState[1]
  const prefetchDataChildren = prefetchData !== null ? prefetchData[1] : null

  if (!didFindRootLayout) {
    // We're currently traversing the part of the tree that was also part of
    // the previous route. If we discover a root layout, then we don't need to
    // trigger an MPA navigation. See beginRenderingNewRouteTree for context.
    const isRootLayout = newRouterState[4] === true
    if (isRootLayout) {
      // Found a matching root layout.
      didFindRootLayout = true
    }
  }

  const oldParallelRoutes = oldCacheNode.parallelRoutes

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
  const prefetchParallelRoutes = new Map(oldParallelRoutes)

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
  let needsDynamicRequest = false
  // As we traverse the children, we'll construct a FlightRouterState that can
  // be sent to the server to request the dynamic data. If it turns out that
  // nothing in the subtree is dynamic (i.e. needsDynamicRequest is false at the
  // end), then this will be discarded.
  // TODO: We can probably optimize the format of this data structure to only
  // include paths that are dynamic. Instead of reusing the
  // FlightRouterState type.
  let dynamicRequestTreeChildren: {
    [parallelRouteKey: string]: FlightRouterState
  } = {}

  for (let parallelRouteKey in newRouterStateChildren) {
    const newRouterStateChild: FlightRouterState =
      newRouterStateChildren[parallelRouteKey]
    const oldRouterStateChild: FlightRouterState | void =
      oldRouterStateChildren[parallelRouteKey]
    const oldSegmentMapChild = oldParallelRoutes.get(parallelRouteKey)
    const prefetchDataChild: CacheNodeSeedData | void | null =
      prefetchDataChildren !== null
        ? prefetchDataChildren[parallelRouteKey]
        : null

    const newSegmentChild = newRouterStateChild[0]
    const newSegmentPathChild = segmentPath.concat([
      parallelRouteKey,
      newSegmentChild,
    ])
    const newSegmentKeyChild = createRouterCacheKey(newSegmentChild)

    const oldSegmentChild =
      oldRouterStateChild !== undefined ? oldRouterStateChild[0] : undefined

    const oldCacheNodeChild =
      oldSegmentMapChild !== undefined
        ? oldSegmentMapChild.get(newSegmentKeyChild)
        : undefined

    let taskChild: Task | null
    if (newSegmentChild === DEFAULT_SEGMENT_KEY) {
      // This is another kind of leaf segment — a default route.
      //
      // Default routes have special behavior. When there's no matching segment
      // for a parallel route, Next.js preserves the currently active segment
      // during a client navigation — but not for initial render. The server
      // leaves it to the client to account for this. So we need to handle
      // it here.
      if (oldRouterStateChild !== undefined) {
        // Reuse the existing Router State for this segment. We spawn a "task"
        // just to keep track of the updated router state; unlike most, it's
        // already fulfilled and won't be affected by the dynamic response.
        taskChild = reuseActiveSegmentInDefaultSlot(oldUrl, oldRouterStateChild)
      } else {
        // There's no currently active segment. Switch to the "create" path.
        taskChild = beginRenderingNewRouteTree(
          navigatedAt,
          oldRouterStateChild,
          newRouterStateChild,
          oldCacheNodeChild,
          didFindRootLayout,
          prefetchDataChild !== undefined ? prefetchDataChild : null,
          prefetchHead,
          isPrefetchHeadPartial,
          newSegmentPathChild,
          scrollableSegmentsResult
        )
      }
    } else if (
      isSamePageNavigation &&
      // Check if this is a page segment.
      // TODO: We're not consistent about how we do this check. Some places
      // check if the segment starts with PAGE_SEGMENT_KEY, but most seem to
      // check if there any any children, which is why I'm doing it here. We
      // should probably encode an empty children set as `null` though. Either
      // way, we should update all the checks to be consistent.
      Object.keys(newRouterStateChild[1]).length === 0
    ) {
      // We special case navigations to the exact same URL as the current
      // location. It's a common UI pattern for apps to refresh when you click a
      // link to the current page. So when this happens, we refresh the dynamic
      // data in the page segments.
      //
      // Note that this does not apply if the any part of the hash or search
      // query has changed. This might feel a bit weird but it makes more sense
      // when you consider that the way to trigger this behavior is to click
      // the same link multiple times.
      //
      // TODO: We should probably refresh the *entire* route when this case
      // occurs, not just the page segments. Essentially treating it the same as
      // a refresh() triggered by an action, which is the more explicit way of
      // modeling the UI pattern described above.
      //
      // Also note that this only refreshes the dynamic data, not static/
      // cached data. If the page segment is fully static and prefetched, the
      // request is skipped. (This is also how refresh() works.)
      taskChild = beginRenderingNewRouteTree(
        navigatedAt,
        oldRouterStateChild,
        newRouterStateChild,
        oldCacheNodeChild,
        didFindRootLayout,
        prefetchDataChild !== undefined ? prefetchDataChild : null,
        prefetchHead,
        isPrefetchHeadPartial,
        newSegmentPathChild,
        scrollableSegmentsResult
      )
    } else if (
      oldRouterStateChild !== undefined &&
      oldSegmentChild !== undefined &&
      matchSegment(newSegmentChild, oldSegmentChild)
    ) {
      if (
        oldCacheNodeChild !== undefined &&
        oldRouterStateChild !== undefined
      ) {
        // This segment exists in both the old and new trees. Recursively update
        // the children.
        taskChild = updateCacheNodeOnNavigation(
          navigatedAt,
          oldUrl,
          oldCacheNodeChild,
          oldRouterStateChild,
          newRouterStateChild,
          didFindRootLayout,
          prefetchDataChild,
          prefetchHead,
          isPrefetchHeadPartial,
          isSamePageNavigation,
          newSegmentPathChild,
          scrollableSegmentsResult
        )
      } else {
        // There's no existing Cache Node for this segment. Switch to the
        // "create" path.
        taskChild = beginRenderingNewRouteTree(
          navigatedAt,
          oldRouterStateChild,
          newRouterStateChild,
          oldCacheNodeChild,
          didFindRootLayout,
          prefetchDataChild !== undefined ? prefetchDataChild : null,
          prefetchHead,
          isPrefetchHeadPartial,
          newSegmentPathChild,
          scrollableSegmentsResult
        )
      }
    } else {
      // This is a new tree. Switch to the "create" path.
      taskChild = beginRenderingNewRouteTree(
        navigatedAt,
        oldRouterStateChild,
        newRouterStateChild,
        oldCacheNodeChild,
        didFindRootLayout,
        prefetchDataChild !== undefined ? prefetchDataChild : null,
        prefetchHead,
        isPrefetchHeadPartial,
        newSegmentPathChild,
        scrollableSegmentsResult
      )
    }

    if (taskChild !== null) {
      // Recursively propagate up the child tasks.

      if (taskChild.route === null) {
        // One of the child tasks discovered a change to the root layout.
        // Immediately unwind from this recursive traversal.
        return MPA_NAVIGATION_TASK
      }

      if (taskChildren === null) {
        taskChildren = new Map()
      }
      taskChildren.set(parallelRouteKey, taskChild)
      const newCacheNodeChild = taskChild.node
      if (newCacheNodeChild !== null) {
        const newSegmentMapChild: ChildSegmentMap = new Map(oldSegmentMapChild)
        newSegmentMapChild.set(newSegmentKeyChild, newCacheNodeChild)
        prefetchParallelRoutes.set(parallelRouteKey, newSegmentMapChild)
      }

      // The child tree's route state may be different from the prefetched
      // route sent by the server. We need to clone it as we traverse back up
      // the tree.
      const taskChildRoute = taskChild.route
      patchedRouterStateChildren[parallelRouteKey] = taskChildRoute

      const dynamicRequestTreeChild = taskChild.dynamicRequestTree
      if (dynamicRequestTreeChild !== null) {
        // Something in the child tree is dynamic.
        needsDynamicRequest = true
        dynamicRequestTreeChildren[parallelRouteKey] = dynamicRequestTreeChild
      } else {
        dynamicRequestTreeChildren[parallelRouteKey] = taskChildRoute
      }
    } else {
      // The child didn't change. We can use the prefetched router state.
      patchedRouterStateChildren[parallelRouteKey] = newRouterStateChild
      dynamicRequestTreeChildren[parallelRouteKey] = newRouterStateChild
    }
  }

  if (taskChildren === null) {
    // No new tasks were spawned.
    return null
  }

  const newCacheNode: ReadyCacheNode = {
    lazyData: null,
    rsc: oldCacheNode.rsc,
    // We intentionally aren't updating the prefetchRsc field, since this node
    // is already part of the current tree, because it would be weird for
    // prefetch data to be newer than the final data. It probably won't ever be
    // observable anyway, but it could happen if the segment is unmounted then
    // mounted again, because LayoutRouter will momentarily switch to rendering
    // prefetchRsc, via useDeferredValue.
    prefetchRsc: oldCacheNode.prefetchRsc,
    head: oldCacheNode.head,
    prefetchHead: oldCacheNode.prefetchHead,
    loading: oldCacheNode.loading,

    // Everything is cloned except for the children, which we computed above.
    parallelRoutes: prefetchParallelRoutes,

    navigatedAt,
  }

  return {
    // Return a cloned copy of the router state with updated children.
    route: patchRouterStateWithNewChildren(
      newRouterState,
      patchedRouterStateChildren
    ),
    node: newCacheNode,
    dynamicRequestTree: needsDynamicRequest
      ? patchRouterStateWithNewChildren(
          newRouterState,
          dynamicRequestTreeChildren
        )
      : null,
    children: taskChildren,
  }
}

function beginRenderingNewRouteTree(
  navigatedAt: number,
  oldRouterState: FlightRouterState | void,
  newRouterState: FlightRouterState,
  existingCacheNode: CacheNode | void,
  didFindRootLayout: boolean,
  prefetchData: CacheNodeSeedData | null,
  possiblyPartialPrefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  segmentPath: FlightSegmentPath,
  scrollableSegmentsResult: Array<FlightSegmentPath>
): Task {
  if (!didFindRootLayout) {
    // The route tree changed before we reached a layout. (The highest-level
    // layout in a route tree is referred to as the "root" layout.) This could
    // mean that we're navigating between two different root layouts. When this
    // happens, we perform a full-page (MPA-style) navigation.
    //
    // However, the algorithm for deciding where to start rendering a route
    // (i.e. the one performed in order to reach this function) is stricter
    // than the one used to detect a change in the root layout. So just because
    // we're re-rendering a segment outside of the root layout does not mean we
    // should trigger a full-page navigation.
    //
    // Specifically, we handle dynamic parameters differently: two segments are
    // considered the same even if their parameter values are different.
    //
    // Refer to isNavigatingToNewRootLayout for details.
    //
    // Note that we only have to perform this extra traversal if we didn't
    // already discover a root layout in the part of the tree that is unchanged.
    // In the common case, this branch is skipped completely.
    if (
      oldRouterState === undefined ||
      isNavigatingToNewRootLayout(oldRouterState, newRouterState)
    ) {
      // The root layout changed. Perform a full-page navigation.
      return MPA_NAVIGATION_TASK
    }
  }
  return createCacheNodeOnNavigation(
    navigatedAt,
    newRouterState,
    existingCacheNode,
    prefetchData,
    possiblyPartialPrefetchHead,
    isPrefetchHeadPartial,
    segmentPath,
    scrollableSegmentsResult
  )
}

function createCacheNodeOnNavigation(
  navigatedAt: number,
  routerState: FlightRouterState,
  existingCacheNode: CacheNode | void,
  prefetchData: CacheNodeSeedData | null,
  possiblyPartialPrefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  segmentPath: FlightSegmentPath,
  scrollableSegmentsResult: Array<FlightSegmentPath>
): SPANavigationTask {
  // Same traversal as updateCacheNodeNavigation, but we switch to this path
  // once we reach the part of the tree that was not in the previous route. We
  // don't need to diff against the old tree, we just need to create a new one.

  // The head is assigned to every leaf segment delivered by the server. Based
  // on corresponding logic in fill-lazy-items-till-leaf-with-head.ts
  const routerStateChildren = routerState[1]
  const isLeafSegment = Object.keys(routerStateChildren).length === 0

  // Even we're rendering inside the "new" part of the target tree, we may have
  // a locally cached segment that we can reuse. This may come from either 1)
  // the CacheNode tree, which lives in React state and is populated by previous
  // navigations; or 2) the prefetch cache, which is a separate cache that is
  // populated by prefetches.
  let rsc: React.ReactNode
  let loading: LoadingModuleData | Promise<LoadingModuleData>
  let head: HeadData | null
  let cacheNodeNavigatedAt: number
  if (
    existingCacheNode !== undefined &&
    // DYNAMIC_STALETIME_MS defaults to 0, but it can be increased using
    // the experimental.staleTimes.dynamic config. When set, we'll avoid
    // refetching dynamic data if it was fetched within the given threshold.
    existingCacheNode.navigatedAt + DYNAMIC_STALETIME_MS > navigatedAt
  ) {
    // We have an existing CacheNode for this segment, and it's not stale. We
    // should reuse it rather than request a new one.
    rsc = existingCacheNode.rsc
    loading = existingCacheNode.loading
    head = existingCacheNode.head

    // Don't update the navigatedAt timestamp, since we're reusing stale data.
    cacheNodeNavigatedAt = existingCacheNode.navigatedAt
  } else if (prefetchData !== null) {
    // There's no existing CacheNode for this segment, but we do have prefetch
    // data. If the prefetch data is fully static (i.e. does not contain any
    // dynamic holes), we don't need to request it from the server.
    rsc = prefetchData[0]
    loading = prefetchData[2]
    head = isLeafSegment ? possiblyPartialPrefetchHead : null
    // Even though we're accessing the data from the prefetch cache, this is
    // conceptually a new segment, not a reused one. So we should update the
    // navigatedAt timestamp.
    cacheNodeNavigatedAt = navigatedAt
    const isPrefetchRscPartial = prefetchData[3]
    if (
      // Check if the segment data is partial
      isPrefetchRscPartial ||
      // Check if the head is partial (only relevant if this is a leaf segment)
      (isPrefetchHeadPartial && isLeafSegment)
    ) {
      // We only have partial data from this segment. Like missing segments, we
      // must request the full data from the server.
      return spawnPendingTask(
        navigatedAt,
        routerState,
        prefetchData,
        possiblyPartialPrefetchHead,
        isPrefetchHeadPartial,
        segmentPath,
        scrollableSegmentsResult
      )
    } else {
      // The prefetch data is fully static, so we can omit it from the
      // navigation request.
    }
  } else {
    // There's no prefetch for this segment. Everything from this point will be
    // requested from the server, even if there are static children below it.
    // Create a terminal task node that will later be fulfilled by
    // server response.
    return spawnPendingTask(
      navigatedAt,
      routerState,
      null,
      possiblyPartialPrefetchHead,
      isPrefetchHeadPartial,
      segmentPath,
      scrollableSegmentsResult
    )
  }

  // We already have a full segment we can render, so we don't need to request a
  // new one from the server. Keep traversing down the tree until we reach
  // something that requires a dynamic request.
  const prefetchDataChildren = prefetchData !== null ? prefetchData[1] : null
  const taskChildren = new Map()
  const existingCacheNodeChildren =
    existingCacheNode !== undefined ? existingCacheNode.parallelRoutes : null
  const cacheNodeChildren = new Map(existingCacheNodeChildren)
  let dynamicRequestTreeChildren: {
    [parallelRouteKey: string]: FlightRouterState
  } = {}
  let needsDynamicRequest = false
  if (isLeafSegment) {
    // The segment path of every leaf segment (i.e. page) is collected into
    // a result array. This is used by the LayoutRouter to scroll to ensure that
    // new pages are visible after a navigation.
    // TODO: We should use a string to represent the segment path instead of
    // an array. We already use a string representation for the path when
    // accessing the Segment Cache, so we can use the same one.
    scrollableSegmentsResult.push(segmentPath)
  } else {
    for (let parallelRouteKey in routerStateChildren) {
      const routerStateChild: FlightRouterState =
        routerStateChildren[parallelRouteKey]
      const prefetchDataChild: CacheNodeSeedData | void | null =
        prefetchDataChildren !== null
          ? prefetchDataChildren[parallelRouteKey]
          : null
      const existingSegmentMapChild =
        existingCacheNodeChildren !== null
          ? existingCacheNodeChildren.get(parallelRouteKey)
          : undefined
      const segmentChild = routerStateChild[0]
      const segmentPathChild = segmentPath.concat([
        parallelRouteKey,
        segmentChild,
      ])
      const segmentKeyChild = createRouterCacheKey(segmentChild)

      const existingCacheNodeChild =
        existingSegmentMapChild !== undefined
          ? existingSegmentMapChild.get(segmentKeyChild)
          : undefined

      const taskChild = createCacheNodeOnNavigation(
        navigatedAt,
        routerStateChild,
        existingCacheNodeChild,
        prefetchDataChild,
        possiblyPartialPrefetchHead,
        isPrefetchHeadPartial,
        segmentPathChild,
        scrollableSegmentsResult
      )
      taskChildren.set(parallelRouteKey, taskChild)
      const dynamicRequestTreeChild = taskChild.dynamicRequestTree
      if (dynamicRequestTreeChild !== null) {
        // Something in the child tree is dynamic.
        needsDynamicRequest = true
        dynamicRequestTreeChildren[parallelRouteKey] = dynamicRequestTreeChild
      } else {
        dynamicRequestTreeChildren[parallelRouteKey] = routerStateChild
      }
      const newCacheNodeChild = taskChild.node
      if (newCacheNodeChild !== null) {
        const newSegmentMapChild: ChildSegmentMap = new Map()
        newSegmentMapChild.set(segmentKeyChild, newCacheNodeChild)
        cacheNodeChildren.set(parallelRouteKey, newSegmentMapChild)
      }
    }
  }

  return {
    // Since we're inside a new route tree, unlike the
    // `updateCacheNodeOnNavigation` path, the router state on the children
    // tasks is always the same as the router state we pass in. So we don't need
    // to clone/modify it.
    route: routerState,
    node: {
      lazyData: null,
      // Since this segment is already full, we don't need to use the
      // `prefetchRsc` field.
      rsc,
      prefetchRsc: null,
      head,
      prefetchHead: null,
      loading,
      parallelRoutes: cacheNodeChildren,
      navigatedAt: cacheNodeNavigatedAt,
    },
    dynamicRequestTree: needsDynamicRequest
      ? patchRouterStateWithNewChildren(routerState, dynamicRequestTreeChildren)
      : null,
    children: taskChildren,
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

function spawnPendingTask(
  navigatedAt: number,
  routerState: FlightRouterState,
  prefetchData: CacheNodeSeedData | null,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  segmentPath: FlightSegmentPath,
  scrollableSegmentsResult: Array<FlightSegmentPath>
): SPANavigationTask {
  // Create a task that will later be fulfilled by data from the server.

  // Clone the prefetched route tree and the `refetch` marker to it. We'll send
  // this to the server so it knows where to start rendering.
  const dynamicRequestTree = patchRouterStateWithNewChildren(
    routerState,
    routerState[1]
  )
  dynamicRequestTree[3] = 'refetch'

  const newTask: Task = {
    route: routerState,

    // Corresponds to the part of the route that will be rendered on the server.
    node: createPendingCacheNode(
      navigatedAt,
      routerState,
      prefetchData,
      prefetchHead,
      isPrefetchHeadPartial,
      segmentPath,
      scrollableSegmentsResult
    ),
    // Because this is non-null, and it gets propagated up through the parent
    // tasks, the root task will know that it needs to perform a server request.
    dynamicRequestTree,
    children: null,
  }
  return newTask
}

function reuseActiveSegmentInDefaultSlot(
  oldUrl: URL,
  oldRouterState: FlightRouterState
): Task {
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

  return {
    route: reusedRouterState,
    node: null,
    dynamicRequestTree: null,
    children: null,
  }
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
  task: SPANavigationTask,
  responsePromise: Promise<FetchServerResponseResult>
) {
  responsePromise.then(
    (result: FetchServerResponseResult) => {
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

      // Now that we've exhausted all the data we received from the server, if
      // there are any remaining pending tasks in the tree, abort them now.
      // If there's any missing data, it will trigger a lazy fetch.
      abortTask(task, null, debugInfo)
    },
    (error: any) => {
      // This will trigger an error during render
      abortTask(task, error, null)
    }
  )
}

function writeDynamicDataIntoPendingTask(
  rootTask: SPANavigationTask,
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
  task: SPANavigationTask,
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
      // Set this to null to indicate that this task is now complete.
      task.dynamicRequestTree = null
    }
    return
  }
  // The server returned more data than we need to finish the task. Skip over
  // the extra segments until we reach the leaf task node.
  const serverChildren = serverRouterState[1]
  const dynamicDataChildren = dynamicData[1]

  for (const parallelRouteKey in serverRouterState) {
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
        return finishTaskUsingDynamicDataPayload(
          taskChild,
          serverRouterStateChild,
          dynamicDataChild,
          dynamicHead,
          debugInfo
        )
      }
    }
    // We didn't find a child task that matches the server data. We won't abort
    // the task, though, because a different FlightDataPath may be able to
    // fulfill it (see loop in listenForDynamicRequest). We only abort tasks
    // once we've run out of data.
  }
}

function createPendingCacheNode(
  navigatedAt: number,
  routerState: FlightRouterState,
  prefetchData: CacheNodeSeedData | null,
  prefetchHead: HeadData | null,
  isPrefetchHeadPartial: boolean,
  segmentPath: FlightSegmentPath,
  scrollableSegmentsResult: Array<FlightSegmentPath>
): ReadyCacheNode {
  const routerStateChildren = routerState[1]
  const prefetchDataChildren = prefetchData !== null ? prefetchData[1] : null

  const parallelRoutes = new Map()
  for (let parallelRouteKey in routerStateChildren) {
    const routerStateChild: FlightRouterState =
      routerStateChildren[parallelRouteKey]
    const prefetchDataChild: CacheNodeSeedData | null | void =
      prefetchDataChildren !== null
        ? prefetchDataChildren[parallelRouteKey]
        : null

    const segmentChild = routerStateChild[0]
    const segmentPathChild = segmentPath.concat([
      parallelRouteKey,
      segmentChild,
    ])
    const segmentKeyChild = createRouterCacheKey(segmentChild)

    const newCacheNodeChild = createPendingCacheNode(
      navigatedAt,
      routerStateChild,
      prefetchDataChild === undefined ? null : prefetchDataChild,
      prefetchHead,
      isPrefetchHeadPartial,
      segmentPathChild,
      scrollableSegmentsResult
    )

    const newSegmentMapChild: ChildSegmentMap = new Map()
    newSegmentMapChild.set(segmentKeyChild, newCacheNodeChild)
    parallelRoutes.set(parallelRouteKey, newSegmentMapChild)
  }

  // The head is assigned to every leaf segment delivered by the server. Based
  // on corresponding logic in fill-lazy-items-till-leaf-with-head.ts
  const isLeafSegment = parallelRoutes.size === 0

  if (isLeafSegment) {
    // The segment path of every leaf segment (i.e. page) is collected into
    // a result array. This is used by the LayoutRouter to scroll to ensure that
    // new pages are visible after a navigation.
    // TODO: We should use a string to represent the segment path instead of
    // an array. We already use a string representation for the path when
    // accessing the Segment Cache, so we can use the same one.
    scrollableSegmentsResult.push(segmentPath)
  }

  const maybePrefetchRsc = prefetchData !== null ? prefetchData[0] : null
  return {
    lazyData: null,
    parallelRoutes: parallelRoutes,

    prefetchRsc: maybePrefetchRsc !== undefined ? maybePrefetchRsc : null,
    prefetchHead: isLeafSegment ? prefetchHead : [null, null],

    // Create a deferred promise. This will be fulfilled once the dynamic
    // response is received from the server.
    rsc: createDeferredRsc() as React.ReactNode,
    head: isLeafSegment ? (createDeferredRsc() as React.ReactNode) : null,

    // TODO: Technically, a loading boundary could contain dynamic data. We must
    // have separate `loading` and `prefetchLoading` fields to handle this, like
    // we do for the segment data and head.
    loading:
      prefetchData !== null
        ? (prefetchData[2] ?? null)
        : // If we don't have a prefetch, then we don't know if there's a loading component.
          // We'll fulfill it based on the dynamic response, just like `rsc` and `head`.
          createDeferredRsc<LoadingModuleData>(),

    navigatedAt,
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
        matchSegment(taskSegmentChild, serverStateChild[0])
      ) {
        if (dataChild !== undefined && dataChild !== null) {
          // This is the happy path. Recursively update all the children.
          finishPendingCacheNode(
            cacheNodeChild,
            taskStateChild,
            serverStateChild,
            dataChild,
            dynamicHead,
            debugInfo
          )
        } else {
          // The server never returned data for this segment. Trigger a lazy
          // fetch during render. This shouldn't happen because the Route Tree
          // and the Seed Data tree sent by the server should always be the same
          // shape when part of the same server response.
          abortPendingCacheNode(taskStateChild, cacheNodeChild, null, debugInfo)
        }
      } else {
        // The server never returned data for this segment. Trigger a lazy
        // fetch during render.
        abortPendingCacheNode(taskStateChild, cacheNodeChild, null, debugInfo)
      }
    } else {
      // The server response matches what was expected to receive, but there's
      // no matching Cache Node in the task tree. This is a bug in the
      // implementation because we should have created a node for every
      // segment in the tree that's associated with this task.
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
  task: SPANavigationTask,
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

export function updateCacheNodeOnPopstateRestoration(
  oldCacheNode: CacheNode,
  routerState: FlightRouterState
): ReadyCacheNode {
  // A popstate navigation reads data from the local cache. It does not issue
  // new network requests (unless the cache entries have been evicted). So, we
  // update the cache to drop the prefetch data for any segment whose dynamic
  // data was already received. This prevents an unnecessary flash back to PPR
  // state during a back/forward navigation.
  //
  // This function clones the entire cache node tree and sets the `prefetchRsc`
  // field to `null` to prevent it from being rendered. We can't mutate the node
  // in place because this is a concurrent data structure.

  const routerStateChildren = routerState[1]
  const oldParallelRoutes = oldCacheNode.parallelRoutes
  const newParallelRoutes = new Map(oldParallelRoutes)
  for (let parallelRouteKey in routerStateChildren) {
    const routerStateChild: FlightRouterState =
      routerStateChildren[parallelRouteKey]
    const segmentChild = routerStateChild[0]
    const segmentKeyChild = createRouterCacheKey(segmentChild)
    const oldSegmentMapChild = oldParallelRoutes.get(parallelRouteKey)
    if (oldSegmentMapChild !== undefined) {
      const oldCacheNodeChild = oldSegmentMapChild.get(segmentKeyChild)
      if (oldCacheNodeChild !== undefined) {
        const newCacheNodeChild = updateCacheNodeOnPopstateRestoration(
          oldCacheNodeChild,
          routerStateChild
        )
        const newSegmentMapChild = new Map(oldSegmentMapChild)
        newSegmentMapChild.set(segmentKeyChild, newCacheNodeChild)
        newParallelRoutes.set(parallelRouteKey, newSegmentMapChild)
      }
    }
  }

  // Only show prefetched data if the dynamic data is still pending.
  //
  // Tehnically, what we're actually checking is whether the dynamic network
  // response was received. But since it's a streaming response, this does not
  // mean that all the dynamic data has fully streamed in. It just means that
  // _some_ of the dynamic data was received. But as a heuristic, we assume that
  // the rest dynamic data will stream in quickly, so it's still better to skip
  // the prefetch state.
  const rsc = oldCacheNode.rsc
  const shouldUsePrefetch = isDeferredRsc(rsc) && rsc.status === 'pending'

  return {
    lazyData: null,
    rsc,
    head: oldCacheNode.head,

    prefetchHead: shouldUsePrefetch ? oldCacheNode.prefetchHead : [null, null],
    prefetchRsc: shouldUsePrefetch ? oldCacheNode.prefetchRsc : null,
    loading: oldCacheNode.loading,

    // These are the cloned children we computed above
    parallelRoutes: newParallelRoutes,

    navigatedAt: oldCacheNode.navigatedAt,
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
