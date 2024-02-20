import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../server/app-render/types'
import type { FetchServerResponseResult } from './fetch-server-response'

export const ACTION_REFRESH = 'refresh'
export const ACTION_NAVIGATE = 'navigate'
export const ACTION_RESTORE = 'restore'
export const ACTION_SERVER_PATCH = 'server-patch'
export const ACTION_PREFETCH = 'prefetch'
export const ACTION_FAST_REFRESH = 'fast-refresh'
export const ACTION_SERVER_ACTION = 'server-action'

export type RouterChangeByServerResponse = ({
  previousTree,
  serverResponse,
}: {
  previousTree: FlightRouterState
  serverResponse: FetchServerResponseResult
}) => void

export type RouterNavigate = (
  href: string,
  navigateType: 'push' | 'replace',
  shouldScroll: boolean
) => void

export interface Mutable {
  mpaNavigation?: boolean
  patchedTree?: FlightRouterState
  canonicalUrl?: string
  scrollableSegments?: FlightSegmentPath[]
  pendingPush?: boolean
  cache?: CacheNode
  prefetchCache?: AppRouterState['prefetchCache']
  hashFragment?: string
  shouldScroll?: boolean
  preserveCustomHistoryState?: boolean
}

export interface ServerActionMutable extends Mutable {
  inFlightServerAction?: Promise<any> | null
}

/**
 * Refresh triggers a refresh of the full page data.
 * - fetches the Flight data and fills rsc at the root of the cache.
 * - The router state is updated at the root.
 */
export interface RefreshAction {
  type: typeof ACTION_REFRESH
  origin: Location['origin']
}

export interface FastRefreshAction {
  type: typeof ACTION_FAST_REFRESH
  origin: Location['origin']
}

export type ServerActionDispatcher = (
  args: Omit<
    ServerActionAction,
    'type' | 'mutable' | 'navigate' | 'changeByServerResponse' | 'cache'
  >
) => void

export interface ServerActionAction {
  type: typeof ACTION_SERVER_ACTION
  actionId: string
  actionArgs: any[]
  resolve: (value: any) => void
  reject: (reason?: any) => void
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
  shouldScroll: boolean
}

/**
 * Restore applies the provided router state.
 * - Used for `popstate` (back/forward navigation) where a known router state has to be applied.
 * - Also used when syncing the router state with `pushState`/`replaceState` calls.
 * - Router state is applied as-is from the history state, if available.
 * - If the history state does not contain the router state, the existing router state is used.
 * - If any cache node is missing it will be fetched in layout-router during rendering and the server-patch case.
 * - If existing cache nodes match these are used.
 */
export interface RestoreAction {
  type: typeof ACTION_RESTORE
  url: URL
  tree: FlightRouterState | undefined
}

/**
 * Server-patch applies the provided Flight data to the cache and router tree.
 * - Only triggered in layout-router.
 * - Creates a new cache and router state with the Flight data applied.
 */
export interface ServerPatchAction {
  type: typeof ACTION_SERVER_PATCH
  serverResponse: FetchServerResponseResult
  previousTree: FlightRouterState
}

/**
 * PrefetchKind defines the type of prefetching that should be done.
 * - `auto` - if the page is dynamic, prefetch the page data partially, if static prefetch the page data fully.
 * - `full` - prefetch the page data fully.
 * - `temporary` - a temporary prefetch entry is added to the cache, this is used when prefetch={false} is used in next/link or when you push a route programmatically.
 */

export enum PrefetchKind {
  AUTO = 'auto',
  FULL = 'full',
  TEMPORARY = 'temporary',
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
  kind: PrefetchKind
}

export interface PushRef {
  /**
   * If the app-router should push a new history entry in app-router's useEffect()
   */
  pendingPush: boolean
  /**
   * Multi-page navigation through location.href.
   */
  mpaNavigation: boolean
  /**
   * Skip applying the router state to the browser history state.
   */
  preserveCustomHistoryState: boolean
}

export type FocusAndScrollRef = {
  /**
   * If focus and scroll should be set in the layout-router's useEffect()
   */
  apply: boolean
  /**
   * The hash fragment that should be scrolled to.
   */
  hashFragment: string | null
  /**
   * The paths of the segments that should be focused.
   */
  segmentPaths: FlightSegmentPath[]
  /**
   * If only the URLs hash fragment changed
   */
  onlyHashChange: boolean
}

export type PrefetchCacheEntry = {
  treeAtTimeOfPrefetch: FlightRouterState
  data: Promise<FetchServerResponseResult>
  kind: PrefetchKind
  prefetchTime: number
  lastUsedTime: number | null
  key: string
  status: PrefetchCacheEntryStatus
}

export enum PrefetchCacheEntryStatus {
  fresh = 'fresh',
  reusable = 'reusable',
  expired = 'expired',
  stale = 'stale',
}

/**
 * Handles keeping the state of app-router.
 */
export type AppRouterState = {
  /**
   * The buildId is used to do a mpaNavigation when the server returns a different buildId.
   * It is used to avoid issues where an older version of the app is loaded in the browser while the server has a new version.
   */
  buildId: string
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
  prefetchCache: Map<string, PrefetchCacheEntry>
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
  /**
   * The underlying "url" representing the UI state, which is used for intercepting routes.
   */
  nextUrl: string | null
}

export type ReadonlyReducerState = Readonly<AppRouterState>
export type ReducerState = Promise<AppRouterState> | AppRouterState
export type ReducerActions = Readonly<
  | RefreshAction
  | NavigateAction
  | RestoreAction
  | ServerPatchAction
  | PrefetchAction
  | FastRefreshAction
  | ServerActionAction
>

export function isThenable(value: any): value is Promise<AppRouterState> {
  // TODO: We don't gain anything from this abstraction. It's unsound, and only
  // makes sense in the specific places where we use it. So it's better to keep
  // the type coercion inline, instead of leaking this to other places in
  // the codebase.
  return (
    value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
  )
}
