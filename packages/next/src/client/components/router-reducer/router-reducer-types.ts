import { CacheNode } from '../../../shared/lib/app-router-context'
import { FlightRouterState, FlightData } from '../../../server/app-render'
import { fetchServerResponse } from './fetch-server-response'

export const ACTION_REFRESH = 'refresh'
export const ACTION_NAVIGATE = 'navigate'
export const ACTION_RESTORE = 'restore'
export const ACTION_SERVER_PATCH = 'server-patch'
export const ACTION_PREFETCH = 'prefetch'

export interface Mutable {
  mpaNavigation?: boolean
  previousTree?: FlightRouterState
  patchedTree?: FlightRouterState
  canonicalUrl?: string
  applyFocusAndScroll?: boolean
  pendingPush?: boolean
  cache?: CacheNode
}

/**
 * Refresh triggers a refresh of the full page data.
 * - fetches the Flight data and fills subTreeData at the root of the cache.
 * - The router state is updated at the root.
 */
export interface RefreshAction {
  type: typeof ACTION_REFRESH
  cache: CacheNode
  mutable: Mutable
  origin: Location['origin']
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
export interface NavigateAction {
  type: typeof ACTION_NAVIGATE
  url: URL
  isExternalUrl: boolean
  locationSearch: Location['search']
  navigateType: 'push' | 'replace'
  forceOptimisticNavigation: boolean
  cache: CacheNode
  mutable: Mutable
}

/**
 * Restore applies the provided router state.
 * - Only used for `popstate` (back/forward navigation) where a known router state has to be applied.
 * - Router state is applied as-is from the history state.
 * - If any cache node is missing it will be fetched in layout-router during rendering and the server-patch case.
 * - If existing cache nodes match these are used.
 */
export interface RestoreAction {
  type: typeof ACTION_RESTORE
  url: URL
  tree: FlightRouterState
}

/**
 * Server-patch applies the provided Flight data to the cache and router tree.
 * - Only triggered in layout-router.
 * - Creates a new cache and router state with the Flight data applied.
 */
export interface ServerPatchAction {
  type: typeof ACTION_SERVER_PATCH
  flightData: FlightData
  previousTree: FlightRouterState
  overrideCanonicalUrl: URL | undefined
  cache: CacheNode
  mutable: Mutable
}

/**
 * Prefetch adds the provided FlightData to the prefetch cache
 * - Creates the router state tree based on the patch in FlightData
 * - Adds the FlightData to the prefetch cache
 * - In ACTION_NAVIGATE the prefetch cache is checked and the router state tree and FlightData are applied.
 */
export interface PrefetchAction {
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

export type FocusAndScrollRef = {
  /**
   * If focus and scroll should be set in the layout-router's useEffect()
   */
  apply: boolean
}

/**
 * Handles keeping the state of app-router.
 */
export type AppRouterState = {
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

export type ReadonlyReducerState = Readonly<AppRouterState>
export type ReducerState = AppRouterState
export type ReducerActions = Readonly<
  | RefreshAction
  | NavigateAction
  | RestoreAction
  | ServerPatchAction
  | PrefetchAction
>
