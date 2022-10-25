import type { CacheNode } from '../../shared/lib/app-router-context'
import type {
  FlightRouterState,
  FlightData,
  FlightDataPath,
  FlightSegmentPath,
  Segment,
} from '../../server/app-render'
import { matchSegment } from './match-segments'
import { fetchServerResponse } from './app-router'

/**
 * Create data fetching record for Promise.
 */
// TODO-APP: change `any` to type inference.
function createRecordFromThenable(thenable: any) {
  thenable.status = 'pending'
  thenable.then(
    (value: any) => {
      if (thenable.status === 'pending') {
        thenable.status = 'fulfilled'
        thenable.value = value
      }
    },
    (err: any) => {
      if (thenable.status === 'pending') {
        thenable.status = 'rejected'
        thenable.value = err
      }
    }
  )
  return thenable
}

/**
 * Read record value or throw Promise if it's not resolved yet.
 */
function readRecordValue(thenable: any) {
  if (thenable.status === 'fulfilled') {
    return thenable.value
  } else {
    throw thenable
  }
}

function createHrefFromUrl(url: URL): string {
  return url.pathname + url.search + url.hash
}

/**
 * Invalidate cache one level down from the router state.
 */
// TODO-APP: Verify if this needs to be recursive.
function invalidateCacheByRouterState(
  newCache: CacheNode,
  existingCache: CacheNode,
  routerState: FlightRouterState
) {
  // Remove segment that we got data for so that it is filled in during rendering of subTreeData.
  for (const key in routerState[1]) {
    const segmentForParallelRoute = routerState[1][key][0]
    const cacheKey = Array.isArray(segmentForParallelRoute)
      ? segmentForParallelRoute[1]
      : segmentForParallelRoute
    const existingParallelRoutesCacheNode =
      existingCache.parallelRoutes.get(key)
    if (existingParallelRoutesCacheNode) {
      let parallelRouteCacheNode = new Map(existingParallelRoutesCacheNode)
      parallelRouteCacheNode.delete(cacheKey)
      newCache.parallelRoutes.set(key, parallelRouteCacheNode)
    }
  }
}

/**
 * Fill cache with subTreeData based on flightDataPath
 */
function fillCacheWithNewSubTreeData(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightDataPath: FlightDataPath
): void {
  const isLastEntry = flightDataPath.length <= 4
  const [parallelRouteKey, segment] = flightDataPath

  const segmentForCache = Array.isArray(segment) ? segment[1] : segment

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  if (!existingChildSegmentMap) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)
  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  const existingChildCacheNode = existingChildSegmentMap.get(segmentForCache)
  let childCacheNode = childSegmentMap.get(segmentForCache)

  // In case of last segment start the fetch at this level and don't copy further down.
  if (isLastEntry) {
    if (
      !childCacheNode ||
      !childCacheNode.data ||
      childCacheNode === existingChildCacheNode
    ) {
      childCacheNode = {
        data: null,
        subTreeData: flightDataPath[3],
        // Ensure segments other than the one we got data for are preserved.
        parallelRoutes: existingChildCacheNode
          ? new Map(existingChildCacheNode.parallelRoutes)
          : new Map(),
      }

      if (existingChildCacheNode) {
        invalidateCacheByRouterState(
          childCacheNode,
          existingChildCacheNode,
          flightDataPath[2]
        )
      }

      childSegmentMap.set(segmentForCache, childCacheNode)
    }
    return
  }

  if (!childCacheNode || !existingChildCacheNode) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      data: childCacheNode.data,
      subTreeData: childCacheNode.subTreeData,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    }
    childSegmentMap.set(segmentForCache, childCacheNode)
  }

  fillCacheWithNewSubTreeData(
    childCacheNode,
    existingChildCacheNode,
    flightDataPath.slice(2)
  )
}

/**
 * Fill cache up to the end of the flightSegmentPath, invalidating anything below it.
 */
function invalidateCacheBelowFlightSegmentPath(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightSegmentPath: FlightSegmentPath
): void {
  const isLastEntry = flightSegmentPath.length <= 2
  const [parallelRouteKey, segment] = flightSegmentPath

  const segmentForCache = Array.isArray(segment) ? segment[1] : segment

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  if (!existingChildSegmentMap) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)
  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  // In case of last entry don't copy further down.
  if (isLastEntry) {
    childSegmentMap.delete(segmentForCache)
    return
  }

  const existingChildCacheNode = existingChildSegmentMap.get(segmentForCache)
  let childCacheNode = childSegmentMap.get(segmentForCache)

  if (!childCacheNode || !existingChildCacheNode) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      data: childCacheNode.data,
      subTreeData: childCacheNode.subTreeData,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    }
    childSegmentMap.set(segmentForCache, childCacheNode)
  }

  invalidateCacheBelowFlightSegmentPath(
    childCacheNode,
    existingChildCacheNode,
    flightSegmentPath.slice(2)
  )
}

/**
 * Fill cache with subTreeData based on flightDataPath that was prefetched
 * This operation is append-only to the existing cache.
 */
function fillCacheWithPrefetchedSubTreeData(
  existingCache: CacheNode,
  flightDataPath: FlightDataPath
): void {
  const isLastEntry = flightDataPath.length <= 4
  const [parallelRouteKey, segment] = flightDataPath

  const segmentForCache = Array.isArray(segment) ? segment[1] : segment

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  if (!existingChildSegmentMap) {
    // Bailout because the existing cache does not have the path to the leaf node
    return
  }

  const existingChildCacheNode = existingChildSegmentMap.get(segmentForCache)

  if (isLastEntry) {
    if (!existingChildCacheNode) {
      existingChildSegmentMap.set(segmentForCache, {
        data: null,
        subTreeData: flightDataPath[3],
        parallelRoutes: new Map(),
      })
    }

    return
  }

  if (!existingChildCacheNode) {
    // Bailout because the existing cache does not have the path to the leaf node
    return
  }

  fillCacheWithPrefetchedSubTreeData(
    existingChildCacheNode,
    flightDataPath.slice(2)
  )
}

/**
 * Kick off fetch based on the common layout between two routes. Fill cache with data property holding the in-progress fetch.
 */
function fillCacheWithDataProperty(
  newCache: CacheNode,
  existingCache: CacheNode,
  segments: string[],
  fetchResponse: () => ReturnType<typeof fetchServerResponse>
): { bailOptimistic: boolean } | undefined {
  const isLastEntry = segments.length === 1

  const parallelRouteKey = 'children'
  const [segment] = segments

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  if (!existingChildSegmentMap) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return { bailOptimistic: true }
  }

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)

  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  const existingChildCacheNode = existingChildSegmentMap.get(segment)
  let childCacheNode = childSegmentMap.get(segment)

  // In case of last segment start off the fetch at this level and don't copy further down.
  if (isLastEntry) {
    if (
      !childCacheNode ||
      !childCacheNode.data ||
      childCacheNode === existingChildCacheNode
    ) {
      childSegmentMap.set(segment, {
        data: fetchResponse(),
        subTreeData: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (!childCacheNode || !existingChildCacheNode) {
    // Start fetch in the place where the existing cache doesn't have the data yet.
    if (!childCacheNode) {
      childSegmentMap.set(segment, {
        data: fetchResponse(),
        subTreeData: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      data: childCacheNode.data,
      subTreeData: childCacheNode.subTreeData,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    }
    childSegmentMap.set(segment, childCacheNode)
  }

  return fillCacheWithDataProperty(
    childCacheNode,
    existingChildCacheNode,
    segments.slice(1),
    fetchResponse
  )
}

/**
 * Create optimistic version of router state based on the existing router state and segments.
 * This is used to allow rendering layout-routers up till the point where data is missing.
 */
function createOptimisticTree(
  segments: string[],
  flightRouterState: FlightRouterState | null,
  _isFirstSegment: boolean,
  parentRefetch: boolean,
  _href?: string
): FlightRouterState {
  const [existingSegment, existingParallelRoutes] = flightRouterState || [
    null,
    {},
  ]
  const segment = segments[0]
  const isLastSegment = segments.length === 1

  const segmentMatches =
    existingSegment !== null && matchSegment(existingSegment, segment)
  const shouldRefetchThisLevel = !flightRouterState || !segmentMatches

  let parallelRoutes: FlightRouterState[1] = {}
  if (existingSegment !== null && segmentMatches) {
    parallelRoutes = existingParallelRoutes
  }

  let childTree
  if (!isLastSegment) {
    const childItem = createOptimisticTree(
      segments.slice(1),
      parallelRoutes ? parallelRoutes.children : null,
      false,
      parentRefetch || shouldRefetchThisLevel
    )

    childTree = childItem
  }

  const result: FlightRouterState = [
    segment,
    {
      ...parallelRoutes,
      ...(childTree ? { children: childTree } : {}),
    },
  ]

  if (!parentRefetch && shouldRefetchThisLevel) {
    result[3] = 'refetch'
  }

  // TODO-APP: Revisit
  // Add url into the tree
  // if (isFirstSegment) {
  //   result[2] = href
  // }

  return result
}

/**
 * Apply the router state from the Flight response. Creates a new router state tree.
 */
function applyRouterStatePatchToTree(
  flightSegmentPath: FlightData[0],
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState
): FlightRouterState | null {
  const [segment, parallelRoutes, , , isRootLayout] = flightRouterState

  // Root refresh
  if (flightSegmentPath.length === 1) {
    const tree: FlightRouterState = [...treePatch]

    // TODO-APP: revisit
    // if (url) {
    //   tree[2] = url
    // }
    return tree
  }

  const [currentSegment, parallelRouteKey] = flightSegmentPath

  // Tree path returned from the server should always match up with the current tree in the browser
  if (!matchSegment(currentSegment, segment)) {
    return null
  }

  const lastSegment = flightSegmentPath.length === 2

  let parallelRoutePatch
  if (lastSegment) {
    parallelRoutePatch = treePatch
  } else {
    parallelRoutePatch = applyRouterStatePatchToTree(
      flightSegmentPath.slice(2),
      parallelRoutes[parallelRouteKey],
      treePatch
    )

    if (parallelRoutePatch === null) {
      return null
    }
  }

  const tree: FlightRouterState = [
    flightSegmentPath[0],
    {
      ...parallelRoutes,
      [parallelRouteKey]: parallelRoutePatch,
    },
  ]

  // Current segment is the root layout
  if (isRootLayout) {
    tree[4] = true
  }

  // TODO-APP: Revisit
  // if (url) {
  //   tree[2] = url
  // }

  return tree
}

function shouldHardNavigate(
  flightSegmentPath: FlightDataPath,
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState
): boolean {
  const [segment, parallelRoutes] = flightRouterState
  // TODO-APP: Check if `as` can be replaced.
  const [currentSegment, parallelRouteKey] = flightSegmentPath as [
    Segment,
    string
  ]

  // Check if current segment matches the existing segment.
  if (!matchSegment(currentSegment, segment)) {
    // If dynamic parameter in tree doesn't match up with segment path a hard navigation is triggered.
    if (Array.isArray(currentSegment)) {
      return true
    }

    // If the existing segment did not match soft navigation is triggered.
    return false
  }
  const lastSegment = flightSegmentPath.length <= 2

  if (lastSegment) {
    return false
  }

  return shouldHardNavigate(
    flightSegmentPath.slice(2),
    parallelRoutes[parallelRouteKey],
    treePatch
  )
}

function isNavigatingToNewRootLayout(
  currentTree: FlightRouterState,
  nextTree: FlightRouterState
): boolean {
  // Compare segments
  const currentTreeSegment = currentTree[0]
  const nextTreeSegment = nextTree[0]
  // If any segment is different before we find the root layout, the root layout has changed.
  // E.g. /same/(group1)/layout.js -> /same/(group2)/layout.js
  // First segment is 'same' for both, keep looking. (group1) changed to (group2) before the root layout was found, it must have changed.
  if (Array.isArray(currentTreeSegment) && Array.isArray(nextTreeSegment)) {
    // Compare dynamic param name and type but ignore the value, different values would not affect the current root layout
    // /[name] - /slug1 and /slug2, both values (slug1 & slug2) still has the same layout /[name]/layout.js
    if (
      currentTreeSegment[0] !== nextTreeSegment[0] ||
      currentTreeSegment[2] !== nextTreeSegment[2]
    ) {
      return true
    }
  } else if (currentTreeSegment !== nextTreeSegment) {
    return true
  }

  // Current tree root layout found
  if (currentTree[4]) {
    // If the next tree doesn't have the root layout flag, it must have changed.
    return !nextTree[4]
  }
  // Current tree  didn't have its root layout here, must have changed.
  if (nextTree[4]) {
    return true
  }
  // We can't assume it's `parallelRoutes.children` here in case the root layout is `app/@something/layout.js`
  // But it's not possible to be more than one parallelRoutes before the root layout is found
  // TODO-APP: change to traverse all parallel routes
  const currentTreeChild = Object.values(currentTree[1])[0]
  const nextTreeChild = Object.values(nextTree[1])[0]
  if (!currentTreeChild || !nextTreeChild) return true
  return isNavigatingToNewRootLayout(currentTreeChild, nextTreeChild)
}

export type FocusAndScrollRef = {
  /**
   * If focus and scroll should be set in the layout-router's useEffect()
   */
  apply: boolean
}

export const ACTION_REFRESH = 'refresh'
export const ACTION_NAVIGATE = 'navigate'
export const ACTION_RESTORE = 'restore'
export const ACTION_SERVER_PATCH = 'server-patch'
export const ACTION_PREFETCH = 'prefetch'

/**
 * Refresh triggers a refresh of the full page data.
 * - fetches the Flight data and fills subTreeData at the root of the cache.
 * - The router state is updated at the root of the state tree.
 */
interface RefreshAction {
  type: typeof ACTION_REFRESH
  cache: CacheNode
  mutable: {
    previousTree?: FlightRouterState
    patchedTree?: FlightRouterState
    mpaNavigation?: boolean
    canonicalUrlOverride?: string
  }
}

/**
 * Navigate triggers a navigation to the provided url. It supports a combination of `cacheType` (`hard` and `soft`) and `navigateType` (`push` and `replace`).
 *
 * `navigateType`:
 * - `push` - pushes a new history entry in the browser history
 * - `replace` - replaces the current history entry in the browser history
 *
 * `cacheType`:
 * - `hard` - Creates a new cache in one of two ways:
 *   - Not optimistic
 *      - Default if there is no loading.js.
 *      - Fetch data in the reducer and suspend there.
 *      - Copies the previous cache nodes as far as possible and applies new subTreeData.
 *      - Applies the new router state.
 *   - optimistic
 *      - Enabled when somewhere in the router state path to the page there is a loading.js.
 *      - Similar to `soft` but kicks off the data fetch in the reducer and applies `data` in the spot that should suspend.
 *      - This enables showing loading states while navigating.
 *      - Will trigger fast path or server-patch case in layout-router.
 * - `soft`
 *   - Reuses the existing cache.
 *   - Creates an optimistic router state that causes the fetch to start in layout-router when there is missing data.
 *   - If there is no missing data the existing cache data is rendered.
 */
interface NavigateAction {
  type: typeof ACTION_NAVIGATE
  url: URL
  navigateType: 'push' | 'replace'
  forceOptimisticNavigation: boolean
  cache: CacheNode
  mutable: {
    mpaNavigation?: boolean
    previousTree?: FlightRouterState
    patchedTree?: FlightRouterState
    canonicalUrlOverride?: string
    useExistingCache?: true
  }
}

/**
 * Restore applies the provided router state.
 * - Only used for `popstate` (back/forward navigation) where a known router state has to be applied.
 * - Router state is applied as-is from the history state.
 * - If any data is missing it will be fetched in layout-router during rendering and trigger fast path or server-patch case.
 * - If no data is missing the existing cached data is rendered.
 */
interface RestoreAction {
  type: typeof ACTION_RESTORE
  url: URL
  tree: FlightRouterState
}

/**
 * Server-patch applies the provided Flight data to the cache and router tree.
 * - Only triggered in layout-router when the data can't be handled in the fast path.
 * - Main case where this is triggered is when a rewrite applies and Flight data for a different path is returned from the server.
 * - Creates a new cache and router state with the Flight data applied.
 */
interface ServerPatchAction {
  type: typeof ACTION_SERVER_PATCH
  flightData: FlightData
  previousTree: FlightRouterState
  overrideCanonicalUrl: URL | undefined
  cache: CacheNode
  mutable: {
    patchedTree?: FlightRouterState
    mpaNavigation?: boolean
    canonicalUrlOverride?: string
  }
}

interface PrefetchAction {
  type: typeof ACTION_PREFETCH
  url: URL
  tree: FlightRouterState
  serverResponse: Awaited<ReturnType<typeof fetchServerResponse>>
}

interface PushRef {
  /**
   * If the app-router should push a new history entry in app-router's useEffect()
   */
  pendingPush: boolean
  /**
   * Multi-page navigation through location.href.
   */
  mpaNavigation: boolean
}

/**
 * Handles keeping the state of app-router.
 */
type AppRouterState = {
  /**
   * The router state, this is written into the history state in app-router using replaceState/pushState.
   * - Has to be serializable as it is written into the history state.
   * - Holds which segments are shown on the screen.
   * - Holds where loading states (loading.js) exists.
   */
  tree: FlightRouterState
  /**
   * The cache holds React nodes for every segment that is shown on screen as well as previously shown segments and prefetched segments.
   * It also holds in-progress data requests.
   */
  cache: CacheNode
  /**
   * Cache that holds prefetched Flight responses keyed by url
   */
  prefetchCache: Map<
    string,
    {
      flightSegmentPath: FlightSegmentPath
      tree: FlightRouterState
      canonicalUrlOverride: URL | undefined
    }
  >
  /**
   * Decides if the update should create a new history entry and if the navigation can't be handled by app-router.
   */
  pushRef: PushRef
  /**
   * Decides if the update should apply scroll and focus management.
   */
  focusAndScrollRef: FocusAndScrollRef
  /**
   * The canonical url that is pushed/replaced
   */
  canonicalUrl: string
}

/**
 * Reducer that handles the app-router state updates.
 */
function clientReducer(
  state: Readonly<AppRouterState>,
  action: Readonly<
    | RefreshAction
    | NavigateAction
    | RestoreAction
    | ServerPatchAction
    | PrefetchAction
  >
): AppRouterState {
  switch (action.type) {
    case ACTION_NAVIGATE: {
      const { url, navigateType, cache, mutable, forceOptimisticNavigation } =
        action
      const { pathname, search } = url
      const href = createHrefFromUrl(url)
      const pendingPush = navigateType === 'push'

      const isForCurrentTree =
        JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

      if (mutable.mpaNavigation && isForCurrentTree) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : href,
          // TODO-APP: verify mpaNavigation not being set is correct here.
          pushRef: {
            pendingPush,
            mpaNavigation: mutable.mpaNavigation,
          },
          // All navigation requires scroll and focus management to trigger.
          focusAndScrollRef: { apply: false },
          // Apply cache.
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          // Apply patched router state.
          tree: state.tree,
        }
      }

      // Handle concurrent rendering / strict mode case where the cache and tree were already populated.
      if (mutable.patchedTree && isForCurrentTree) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : href,
          // TODO-APP: verify mpaNavigation not being set is correct here.
          pushRef: {
            pendingPush,
            mpaNavigation: false,
          },
          // All navigation requires scroll and focus management to trigger.
          focusAndScrollRef: { apply: true },
          // Apply cache.
          cache: mutable.useExistingCache ? state.cache : cache,
          prefetchCache: state.prefetchCache,
          // Apply patched router state.
          tree: mutable.patchedTree,
        }
      }

      const prefetchValues = state.prefetchCache.get(href)
      if (prefetchValues) {
        // The one before last item is the router state tree patch
        const {
          flightSegmentPath,
          tree: newTree,
          canonicalUrlOverride,
        } = prefetchValues

        if (newTree !== null) {
          mutable.previousTree = state.tree
          mutable.patchedTree = newTree
          mutable.mpaNavigation = isNavigatingToNewRootLayout(
            state.tree,
            newTree
          )

          const hardNavigate =
            // TODO-APP: Revisit if this is correct.
            search !== location.search ||
            shouldHardNavigate(
              // TODO-APP: remove ''
              ['', ...flightSegmentPath],
              state.tree,
              newTree
            )

          if (hardNavigate) {
            // TODO-APP: segments.slice(1) strips '', we can get rid of '' altogether.
            // Copy subTreeData for the root node of the cache.
            cache.subTreeData = state.cache.subTreeData

            invalidateCacheBelowFlightSegmentPath(
              cache,
              state.cache,
              flightSegmentPath
            )
          } else {
            mutable.useExistingCache = true
          }

          const canonicalUrlOverrideHref = canonicalUrlOverride
            ? createHrefFromUrl(canonicalUrlOverride)
            : undefined

          if (canonicalUrlOverrideHref) {
            mutable.canonicalUrlOverride = canonicalUrlOverrideHref
          }

          return {
            // Set href.
            canonicalUrl: canonicalUrlOverrideHref
              ? canonicalUrlOverrideHref
              : href,
            // Set pendingPush.
            pushRef: { pendingPush, mpaNavigation: false },
            // All navigation requires scroll and focus management to trigger.
            focusAndScrollRef: { apply: true },
            // Apply patched cache.
            cache: mutable.useExistingCache ? state.cache : cache,
            prefetchCache: state.prefetchCache,
            // Apply patched tree.
            tree: newTree,
          }
        }
      }

      // When doing a hard push there can be two cases: with optimistic tree and without
      // The with optimistic tree case only happens when the layouts have a loading state (loading.js)
      // The without optimistic tree case happens when there is no loading state, in that case we suspend in this reducer

      // forceOptimisticNavigation is used for links that have `prefetch={false}`.
      if (forceOptimisticNavigation) {
        const segments = pathname.split('/')
        // TODO-APP: figure out something better for index pages
        segments.push('')

        // Optimistic tree case.
        // If the optimistic tree is deeper than the current state leave that deeper part out of the fetch
        const optimisticTree = createOptimisticTree(
          segments,
          state.tree,
          true,
          false,
          href
        )

        // Copy subTreeData for the root node of the cache.
        cache.subTreeData = state.cache.subTreeData

        // Copy existing cache nodes as far as possible and fill in `data` property with the started data fetch.
        // The `data` property is used to suspend in layout-router during render if it hasn't resolved yet by the time it renders.
        const res = fillCacheWithDataProperty(
          cache,
          state.cache,
          // TODO-APP: segments.slice(1) strips '', we can get rid of '' altogether.
          segments.slice(1),
          () => fetchServerResponse(url, optimisticTree)
        )

        // If optimistic fetch couldn't happen it falls back to the non-optimistic case.
        if (!res?.bailOptimistic) {
          mutable.previousTree = state.tree
          mutable.patchedTree = optimisticTree
          mutable.mpaNavigation = isNavigatingToNewRootLayout(
            state.tree,
            optimisticTree
          )
          return {
            // Set href.
            canonicalUrl: href,
            // Set pendingPush.
            pushRef: { pendingPush, mpaNavigation: false },
            // All navigation requires scroll and focus management to trigger.
            focusAndScrollRef: { apply: true },
            // Apply patched cache.
            cache: cache,
            prefetchCache: state.prefetchCache,
            // Apply optimistic tree.
            tree: optimisticTree,
          }
        }
      }

      // Below is the not-optimistic case. Data is fetched at the root and suspended there without a suspense boundary.

      // If no in-flight fetch at the top, start it.
      if (!cache.data) {
        cache.data = createRecordFromThenable(
          fetchServerResponse(url, state.tree)
        )
      }

      // Unwrap cache data with `use` to suspend here (in the reducer) until the fetch resolves.
      const [flightData, canonicalUrlOverride] = readRecordValue(cache.data)

      // Handle case when navigating to page in `pages` from `app`
      if (typeof flightData === 'string') {
        return {
          canonicalUrl: flightData,
          // Enable mpaNavigation
          pushRef: { pendingPush: true, mpaNavigation: true },
          // Don't apply scroll and focus management.
          focusAndScrollRef: { apply: false },
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          tree: state.tree,
        }
      }

      // Remove cache.data as it has been resolved at this point.
      cache.data = null

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]

      // The one before last item is the router state tree patch
      const [treePatch, subTreeData] = flightDataPath.slice(-2)

      // Path without the last segment, router state, and the subTreeData
      const flightSegmentPath = flightDataPath.slice(0, -3)

      // Create new tree based on the flightSegmentPath and router state patch
      const newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        ['', ...flightSegmentPath],
        state.tree,
        treePatch
      )

      if (newTree === null) {
        throw new Error('SEGMENT MISMATCH')
      }

      const canonicalUrlOverrideHref = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : undefined
      if (canonicalUrlOverrideHref) {
        mutable.canonicalUrlOverride = canonicalUrlOverrideHref
      }
      mutable.previousTree = state.tree
      mutable.patchedTree = newTree
      mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

      if (flightDataPath.length === 2) {
        cache.subTreeData = subTreeData
      } else {
        // Copy subTreeData for the root node of the cache.
        cache.subTreeData = state.cache.subTreeData
        // Create a copy of the existing cache with the subTreeData applied.
        fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
      }

      return {
        // Set href.
        canonicalUrl: canonicalUrlOverrideHref
          ? canonicalUrlOverrideHref
          : href,
        // Set pendingPush.
        pushRef: { pendingPush, mpaNavigation: false },
        // All navigation requires scroll and focus management to trigger.
        focusAndScrollRef: { apply: true },
        // Apply patched cache.
        cache: cache,
        prefetchCache: state.prefetchCache,
        // Apply patched tree.
        tree: newTree,
      }
    }
    case ACTION_SERVER_PATCH: {
      const { flightData, previousTree, overrideCanonicalUrl, cache, mutable } =
        action

      // When a fetch is slow to resolve it could be that you navigated away while the request was happening or before the reducer runs.
      // In that case opt-out of applying the patch given that the data could be stale.
      if (JSON.stringify(previousTree) !== JSON.stringify(state.tree)) {
        // TODO-APP: Handle tree mismatch
        console.log('TREE MISMATCH')
        // Keep everything as-is.
        return state
      }

      if (mutable.mpaNavigation) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : state.canonicalUrl,
          // TODO-APP: verify mpaNavigation not being set is correct here.
          pushRef: {
            pendingPush: true,
            mpaNavigation: mutable.mpaNavigation,
          },
          // All navigation requires scroll and focus management to trigger.
          focusAndScrollRef: { apply: false },
          // Apply cache.
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          // Apply patched router state.
          tree: state.tree,
        }
      }

      // Handle concurrent rendering / strict mode case where the cache and tree were already populated.
      if (mutable.patchedTree) {
        return {
          // Keep href as it was set during navigate / restore
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : state.canonicalUrl,
          // Keep pushRef as server-patch only causes cache/tree update.
          pushRef: state.pushRef,
          // Keep focusAndScrollRef as server-patch only causes cache/tree update.
          focusAndScrollRef: state.focusAndScrollRef,
          // Apply patched router state
          tree: mutable.patchedTree,
          prefetchCache: state.prefetchCache,
          // Apply patched cache
          cache: cache,
        }
      }

      // Handle case when navigating to page in `pages` from `app`
      if (typeof flightData === 'string') {
        return {
          // Set href.
          canonicalUrl: flightData,
          // Enable mpaNavigation as this is a navigation that the app-router shouldn't handle.
          pushRef: { pendingPush: true, mpaNavigation: true },
          // Don't apply scroll and focus management.
          focusAndScrollRef: { apply: false },
          // Other state is kept as-is.
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          tree: state.tree,
        }
      }

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]

      // Slices off the last segment (which is at -3) as it doesn't exist in the tree yet
      const treePath = flightDataPath.slice(0, -3)
      const [treePatch, subTreeData] = flightDataPath.slice(-2)

      const newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        ['', ...treePath],
        state.tree,
        treePatch
      )

      if (newTree === null) {
        throw new Error('SEGMENT MISMATCH')
      }

      const canonicalUrlOverrideHref = overrideCanonicalUrl
        ? createHrefFromUrl(overrideCanonicalUrl)
        : undefined

      if (canonicalUrlOverrideHref) {
        mutable.canonicalUrlOverride = canonicalUrlOverrideHref
      }

      mutable.patchedTree = newTree
      mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

      // Root refresh
      if (flightDataPath.length === 2) {
        cache.subTreeData = subTreeData
      } else {
        // Copy subTreeData for the root node of the cache.
        cache.subTreeData = state.cache.subTreeData
        fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
      }

      return {
        // Keep href as it was set during navigate / restore
        canonicalUrl: canonicalUrlOverrideHref
          ? canonicalUrlOverrideHref
          : state.canonicalUrl,
        // Keep pushRef as server-patch only causes cache/tree update.
        pushRef: state.pushRef,
        // Keep focusAndScrollRef as server-patch only causes cache/tree update.
        focusAndScrollRef: state.focusAndScrollRef,
        // Apply patched router state
        tree: newTree,
        prefetchCache: state.prefetchCache,
        // Apply patched cache
        cache: cache,
      }
    }
    case ACTION_RESTORE: {
      const { url, tree } = action
      const href = createHrefFromUrl(url)

      return {
        // Set canonical url
        canonicalUrl: href,
        pushRef: state.pushRef,
        focusAndScrollRef: state.focusAndScrollRef,
        cache: state.cache,
        prefetchCache: state.prefetchCache,
        // Restore provided tree
        tree: tree,
      }
    }
    case ACTION_REFRESH: {
      const { cache, mutable } = action
      const href = state.canonicalUrl

      const isForCurrentTree =
        JSON.stringify(mutable.previousTree) === JSON.stringify(state.tree)

      if (mutable.mpaNavigation && isForCurrentTree) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : state.canonicalUrl,
          // TODO-APP: verify mpaNavigation not being set is correct here.
          pushRef: {
            pendingPush: true,
            mpaNavigation: mutable.mpaNavigation,
          },
          // All navigation requires scroll and focus management to trigger.
          focusAndScrollRef: { apply: false },
          // Apply cache.
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          // Apply patched router state.
          tree: state.tree,
        }
      }

      // Handle concurrent rendering / strict mode case where the cache and tree were already populated.
      if (mutable.patchedTree && isForCurrentTree) {
        return {
          // Set href.
          canonicalUrl: mutable.canonicalUrlOverride
            ? mutable.canonicalUrlOverride
            : href,
          // set pendingPush (always false in this case).
          pushRef: state.pushRef,
          // Apply focus and scroll.
          // TODO-APP: might need to disable this for Fast Refresh.
          focusAndScrollRef: { apply: true },
          cache: cache,
          prefetchCache: state.prefetchCache,
          tree: mutable.patchedTree,
        }
      }

      if (!cache.data) {
        // Fetch data from the root of the tree.
        cache.data = createRecordFromThenable(
          fetchServerResponse(new URL(href, location.origin), [
            state.tree[0],
            state.tree[1],
            state.tree[2],
            'refetch',
          ])
        )
      }
      const [flightData, canonicalUrlOverride] = readRecordValue(cache.data)

      // Handle case when navigating to page in `pages` from `app`
      if (typeof flightData === 'string') {
        return {
          canonicalUrl: flightData,
          pushRef: { pendingPush: true, mpaNavigation: true },
          focusAndScrollRef: { apply: false },
          cache: state.cache,
          prefetchCache: state.prefetchCache,
          tree: state.tree,
        }
      }

      // Remove cache.data as it has been resolved at this point.
      cache.data = null

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]

      // FlightDataPath with more than two items means unexpected Flight data was returned
      if (flightDataPath.length !== 2) {
        // TODO-APP: handle this case better
        console.log('REFRESH FAILED')
        return state
      }

      // Given the path can only have two items the items are only the router state and subTreeData for the root.
      const [treePatch, subTreeData] = flightDataPath
      const newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        [''],
        state.tree,
        treePatch
      )

      if (newTree === null) {
        throw new Error('SEGMENT MISMATCH')
      }

      const canonicalUrlOverrideHref = canonicalUrlOverride
        ? createHrefFromUrl(canonicalUrlOverride)
        : undefined

      if (canonicalUrlOverride) {
        mutable.canonicalUrlOverride = canonicalUrlOverrideHref
      }

      mutable.previousTree = state.tree
      mutable.patchedTree = newTree
      mutable.mpaNavigation = isNavigatingToNewRootLayout(state.tree, newTree)

      // Set subTreeData for the root node of the cache.
      cache.subTreeData = subTreeData

      return {
        // Set href, this doesn't reuse the state.canonicalUrl as because of concurrent rendering the href might change between dispatching and applying.
        canonicalUrl: canonicalUrlOverrideHref
          ? canonicalUrlOverrideHref
          : href,
        // set pendingPush (always false in this case).
        pushRef: state.pushRef,
        // TODO-APP: might need to disable this for Fast Refresh.
        focusAndScrollRef: { apply: false },
        // Apply patched cache.
        cache: cache,
        prefetchCache: state.prefetchCache,
        // Apply patched router state.
        tree: newTree,
      }
    }
    case ACTION_PREFETCH: {
      const { url, serverResponse } = action
      const [flightData, canonicalUrlOverride] = serverResponse

      // TODO-APP: Implement prefetch for hard navigation
      if (typeof flightData === 'string') {
        return state
      }

      const href = createHrefFromUrl(url)

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]

      // The one before last item is the router state tree patch
      const [treePatch, subTreeData] = flightDataPath.slice(-2)

      // TODO-APP: Verify if `null` can't be returned from user code.
      // If subTreeData is null the prefetch did not provide a component tree.
      if (subTreeData !== null) {
        fillCacheWithPrefetchedSubTreeData(state.cache, flightDataPath)
      }

      const flightSegmentPath = flightDataPath.slice(0, -2)

      const newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        ['', ...flightSegmentPath],
        state.tree,
        treePatch
      )

      // Patch did not apply correctly
      if (newTree === null) {
        return state
      }

      // Create new tree based on the flightSegmentPath and router state patch
      state.prefetchCache.set(href, {
        // Path without the last segment, router state, and the subTreeData
        flightSegmentPath,
        // Create new tree based on the flightSegmentPath and router state patch
        tree: newTree,
        canonicalUrlOverride,
      })

      return state
    }
    // This case should never be hit as dispatch is strongly typed.
    default:
      throw new Error('Unknown action')
  }
}

function serverReducer(
  state: Readonly<AppRouterState>,
  _action: Readonly<
    | RefreshAction
    | NavigateAction
    | RestoreAction
    | ServerPatchAction
    | PrefetchAction
  >
): AppRouterState {
  return state
}

// we don't run the client reducer on the server, so we use a noop function for better tree shaking
export const reducer =
  typeof window === 'undefined' ? serverReducer : clientReducer
