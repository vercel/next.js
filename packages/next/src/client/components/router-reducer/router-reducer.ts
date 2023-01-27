import { CacheNode, CacheStates } from '../../../shared/lib/app-router-context'
import type {
  FlightRouterState,
  FlightData,
  FlightSegmentPath,
} from '../../../server/app-render'
import { fetchServerResponse } from './fetch-server-response'
import { createRecordFromThenable } from './create-record-from-thenable'
import { readRecordValue } from './read-record-value'
import { createHrefFromUrl } from './create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { fillCacheWithNewSubTreeData } from './fill-cache-with-new-subtree-data'
import { invalidateCacheBelowFlightSegmentPath } from './invalidate-cache-below-flight-segmentpath'
import { fillCacheWithDataProperty } from './fill-cache-with-data-property'
import { createOptimisticTree } from './create-optimistic-tree'
import { applyRouterStatePatchToTree } from './apply-router-state-patch-to-tree'
import { shouldHardNavigate } from './should-hard-navigate'
import { isNavigatingToNewRootLayout } from './is-navigating-to-new-root-layout'

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
 * - The router state is updated at the root.
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
 * Navigate triggers a navigation to the provided url. It supports two types: `push` and `replace`.
 *
 * `navigateType`:
 * - `push` - pushes a new history entry in the browser history
 * - `replace` - replaces the current history entry in the browser history
 *
 * Navigate has multiple cache heuristics:
 * - page was prefetched
 *  - Apply router state tree from prefetch
 *  - Apply Flight data from prefetch to the cache
 *  - If Flight data is a string, it's a redirect and the state is updated to trigger a redirect
 *  - Check if hard navigation is needed
 *    - Hard navigation happens when a dynamic parameter below the common layout changed
 *    - When hard navigation is needed the cache is invalidated below the flightSegmentPath
 *    - The missing cache nodes of the page will be fetched in layout-router and trigger the SERVER_PATCH action
 *  - If hard navigation is not needed
 *    - The cache is reused
 *    - If any cache nodes are missing they'll be fetched in layout-router and trigger the SERVER_PATCH action
 * - page was not prefetched
 *  - The navigate was called from `next/link` with `prefetch={false}`. This case is called `forceOptimisticNavigation`. It triggers an optimistic navigation so that loading spinners can be shown early if any.
 *    - Creates an optimistic router tree based on the provided url
 *    - Adds a cache node to the cache with a Flight data fetch that was eagerly started in the reducer
 *    - Flight data fetch is suspended in the layout-router
 *    - Triggers SERVER_PATCH action when the data comes back, this will apply the data to the cache and router state, at that point the optimistic router tree is replaced by the actual router tree.
 *  - The navigate was called from `next/router` (`router.push()` / `router.replace()`) / `next/link` without prefetched data available (e.g. the prefetch didn't come back from the server before clicking the link)
 *    - Flight data is fetched in the reducer (suspends the reducer)
 *    - Router state tree is created based on Flight data
 *    - Cache is filled based on the Flight data
 *
 * Above steps explain 3 cases:
 * - `soft` - Reuses the existing cache and fetches missing nodes in layout-router.
 * - `hard` - Creates a new cache where cache nodes are removed below the common layout and fetches missing nodes in layout-router.
 * - `optimistic` (explicit no prefetch) - Creates a new cache and kicks off the data fetch in the reducer. The data fetch is awaited in the layout-router.
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
 * - If any cache node is missing it will be fetched in layout-router during rendering and the server-patch case.
 * - If existing cache nodes match these are used.
 */
interface RestoreAction {
  type: typeof ACTION_RESTORE
  url: URL
  tree: FlightRouterState
}

/**
 * Server-patch applies the provided Flight data to the cache and router tree.
 * - Only triggered in layout-router.
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

/**
 * Prefetch adds the provided FlightData to the prefetch cache
 * - Creates the router state tree based on the patch in FlightData
 * - Adds the FlightData to the prefetch cache
 * - In ACTION_NAVIGATE the prefetch cache is checked and the router state tree and FlightData are applied.
 */
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
   * - Holds which segments and parallel routes are shown on the screen.
   */
  tree: FlightRouterState
  /**
   * The cache holds React nodes for every segment that is shown on screen as well as previously shown segments.
   * It also holds in-progress data requests.
   * Prefetched data is stored separately in `prefetchCache`, that is applied during ACTION_NAVIGATE.
   */
  cache: CacheNode
  /**
   * Cache that holds prefetched Flight responses keyed by url.
   */
  prefetchCache: Map<
    string,
    {
      flightData: FlightData
      tree: FlightRouterState
      canonicalUrlOverride: URL | undefined
    }
  >
  /**
   * Decides if the update should create a new history entry and if the navigation has to trigger a browser navigation.
   */
  pushRef: PushRef
  /**
   * Decides if the update should apply scroll and focus management.
   */
  focusAndScrollRef: FocusAndScrollRef
  /**
   * The canonical url that is pushed/replaced.
   * - This is the url you see in the browser.
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
          flightData,
          tree: newTree,
          canonicalUrlOverride,
        } = prefetchValues

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

        if (newTree !== null) {
          mutable.previousTree = state.tree
          mutable.patchedTree = newTree
          mutable.mpaNavigation = isNavigatingToNewRootLayout(
            state.tree,
            newTree
          )

          if (newTree === null) {
            throw new Error('SEGMENT MISMATCH')
          }

          const canonicalUrlOverrideHrefVal = canonicalUrlOverride
            ? createHrefFromUrl(canonicalUrlOverride)
            : undefined
          if (canonicalUrlOverrideHrefVal) {
            mutable.canonicalUrlOverride = canonicalUrlOverrideHrefVal
          }
          mutable.mpaNavigation = isNavigatingToNewRootLayout(
            state.tree,
            newTree
          )

          // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
          const flightDataPath = flightData[0]
          const flightSegmentPath = flightDataPath.slice(
            0,
            -3
          ) as unknown as FlightSegmentPath
          // The one before last item is the router state tree patch
          const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

          // Handles case where prefetch only returns the router tree patch without rendered components.
          if (subTreeData !== null) {
            if (flightDataPath.length === 3) {
              cache.status = CacheStates.READY
              cache.subTreeData = subTreeData
              cache.parallelRoutes = new Map()
              fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)
            } else {
              cache.status = CacheStates.READY
              // Copy subTreeData for the root node of the cache.
              cache.subTreeData = state.cache.subTreeData
              // Create a copy of the existing cache with the subTreeData applied.
              fillCacheWithNewSubTreeData(cache, state.cache, flightDataPath)
            }
          }

          const hardNavigate =
            // TODO-APP: Revisit if this is correct.
            search !== location.search ||
            shouldHardNavigate(
              // TODO-APP: remove ''
              ['', ...flightSegmentPath],
              state.tree
            )

          if (hardNavigate) {
            cache.status = CacheStates.READY
            // Copy subTreeData for the root node of the cache.
            cache.subTreeData = state.cache.subTreeData

            invalidateCacheBelowFlightSegmentPath(
              cache,
              state.cache,
              flightSegmentPath
            )
            // Ensure the existing cache value is used when the cache was not invalidated.
          } else if (subTreeData === null) {
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
        const optimisticTree = createOptimisticTree(segments, state.tree, false)

        // Copy subTreeData for the root node of the cache.
        cache.status = CacheStates.READY
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
      const [flightData, canonicalUrlOverride] = readRecordValue(cache.data!)

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
      const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

      // Path without the last segment, router state, and the subTreeData
      const flightSegmentPath = flightDataPath.slice(0, -4)

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

      if (flightDataPath.length === 3) {
        cache.status = CacheStates.READY
        cache.subTreeData = subTreeData
        fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)
      } else {
        // Copy subTreeData for the root node of the cache.
        cache.status = CacheStates.READY
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

      // Slices off the last segment (which is at -4) as it doesn't exist in the tree yet
      const flightSegmentPath = flightDataPath.slice(0, -4)
      const [treePatch, subTreeData, head] = flightDataPath.slice(-3)

      const newTree = applyRouterStatePatchToTree(
        // TODO-APP: remove ''
        ['', ...flightSegmentPath],
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
      if (flightDataPath.length === 3) {
        cache.status = CacheStates.READY
        cache.subTreeData = subTreeData
        fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)
      } else {
        // Copy subTreeData for the root node of the cache.
        cache.status = CacheStates.READY
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
          focusAndScrollRef: { apply: false },
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
      const [flightData, canonicalUrlOverride] = readRecordValue(cache.data!)

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
      if (flightDataPath.length !== 3) {
        // TODO-APP: handle this case better
        console.log('REFRESH FAILED')
        return state
      }

      // Given the path can only have two items the items are only the router state and subTreeData for the root.
      const [treePatch, subTreeData, head] = flightDataPath
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
      cache.status = CacheStates.READY
      cache.subTreeData = subTreeData
      fillLazyItemsTillLeafWithHead(cache, state.cache, treePatch, head)

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

      if (typeof flightData === 'string') {
        return state
      }

      const href = createHrefFromUrl(url)

      // TODO-APP: Currently the Flight data can only have one item but in the future it can have multiple paths.
      const flightDataPath = flightData[0]

      // The one before last item is the router state tree patch
      const [treePatch] = flightDataPath.slice(-3)

      const flightSegmentPath = flightDataPath.slice(0, -3)

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
        flightData,
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
