import type { FlightRouterState } from '../../shared/lib/app-router-types'
import {
  DEFAULT_SEGMENT_KEY,
  isGroupSegment,
  NOT_FOUND_SEGMENT_KEY,
} from '../../shared/lib/segment'
import {
  extractPathFromFlightRouterState,
  segmentToSourcePagePathname,
} from './router-reducer/compute-changed-path'
import type { AppRouterState } from './router-reducer/router-reducer-types'
import type {
  ClientInstrumentationHooks,
  ClientInstrumentationModules,
  RouterTransitionType,
} from '../router-transition-types'

// The single tracking record for one tracked transition, used only by the
// instrumentation-client router transition hooks. It is created when `start`
// is emitted and threaded through the navigate/restore action, so the
// navigation code that produces the destination state can write into this
// same shared object (via `attachRouterTransitionTarget`) rather than look
// it up by id. It carries everything the eventual `commit`/`abort` event
// needs:
//
// - `id`, `type`, `url` are captured at start. `url` is kept here (rather than
//   derived from the AppRouterState) because it is the destination exactly as
//   the `start` hook reported it; the state's `canonicalUrl` is the
//   post-navigation, post-redirect href and can differ from it in both form
//   and value. Reporting the same string on start/commit/abort is what lets
//   consumers correlate the events.
// - `tree` is attached by the reducer once the destination state exists
//   (`null` until then). HistoryUpdater commits whichever AppRouterState it
//   observes, and `tree` is the unique, reference-stable identity of that
//   state (a fresh FlightRouterState is built for every navigation), so it
//   correlates the commit back to its start without leaking an
//   instrumentation field into the router state itself.
// - `cacheHit` is attached along with the tree; see
//   NavigationRequestAccumulation.instrumentationCacheHit for exactly when it
//   is true.
export type PendingRouterTransition = {
  id: string
  type: RouterTransitionType
  url: string
  tree: FlightRouterState | null
  cacheHit: boolean
}

let instrumentationModules: readonly ClientInstrumentationHooks[] = []
let nextTransitionId = 0
// In-flight transitions, in start order (oldest first). The entries are the
// same objects that are threaded through the actions — this buffer exists
// only for the cross-transition bookkeeping that a single threaded object
// can't provide: commit needs the start *order* to know which older
// transitions were superseded (aborted), and HistoryUpdater needs to find the
// transition whose tree it just applied. An entry is added on `start` and
// leaves the buffer in exactly one of two ways: its own tree is committed by
// HistoryUpdater (`commit`), or a newer transition commits first (`abort`,
// superseded). Only populated when the experimental flag is on, so it
// tree-shakes away in the default build.
const pendingTransitions: PendingRouterTransition[] = []

export function initializeRouterTransitionModules(
  modules: ClientInstrumentationModules
): void {
  instrumentationModules = modules.filter(
    (module): module is ClientInstrumentationHooks => module != null
  )
}

function callHooks(invoke: (hooks: ClientInstrumentationHooks) => void): void {
  for (const hooks of instrumentationModules) {
    try {
      invoke(hooks)
    } catch (error) {
      console.error(
        'An instrumentation-client router transition hook failed',
        error
      )
    }
  }
}

function hasLifecycleInstrumentation(): boolean {
  return instrumentationModules.some(
    (hooks) =>
      typeof hooks.onRouterTransitionStart === 'function' ||
      typeof hooks.unstable_onRouterTransitionCommit === 'function' ||
      typeof hooks.unstable_onRouterTransitionAbort === 'function'
  )
}

/**
 * Emits the `start` event for a navigation and, when the experimental
 * lifecycle is enabled, begins tracking it: the transition is recorded in
 * `pendingTransitions` immediately, so that it is reported as aborted if a
 * newer navigation commits before this one produces a destination tree.
 *
 * The `from*` fields describe the route being left; they are read from the
 * current AppRouterState here (rather than passed in) since this is the only
 * transition hook that needs it.
 *
 * Returns the pending transition when the lifecycle is active — the caller
 * threads the object through the reducer action so the navigation code can
 * attach the destination tree to it once it exists — or `null` for the legacy
 * two-argument hook.
 */
export function startRouterTransition(
  url: string,
  type: RouterTransitionType
): PendingRouterTransition | null {
  // Positive flag check so the instrumentation-only path is removed by DCE when disabled.
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    if (!hasLifecycleInstrumentation()) {
      return null
    }

    // Lazy require to avoid a static import cycle: app-router-instance
    // imports this module to emit `start` when dispatching. (Same pattern as
    // links.ts.)
    const { getCurrentAppRouterState } =
      require('./app-router-instance') as typeof import('./app-router-instance')
    const state = getCurrentAppRouterState()
    if (state === null) {
      // Navigations can only be dispatched after hydration creates the action
      // queue, so this shouldn't happen; degrade to the legacy hook shape
      // rather than throw from an instrumentation path.
      callHooks((hooks) => hooks.onRouterTransitionStart?.(url, type, null))
      return null
    }

    const now = Date.now()
    const id = `${now.toString(36)}-${(++nextTransitionId).toString(36)}`
    const transition: PendingRouterTransition = {
      id,
      type,
      url,
      tree: null,
      cacheHit: false,
    }
    pendingTransitions.push(transition)

    const from = describeRouteForInstrumentation(
      state.tree,
      state.canonicalUrl,
      state.renderedSearch
    )
    callHooks((hooks) =>
      hooks.onRouterTransitionStart?.(url, type, {
        id,
        timestamp: now,
        fromRenderedPathname: from.renderedPathname,
        fromCanonicalUrl: from.canonicalUrl,
        fromRouteTemplates: from.routeTemplates,
        fromParams: from.params,
        fromSearchParams: from.searchParams,
      })
    )
    return transition
  } else {
    callHooks((hooks) => hooks.onRouterTransitionStart?.(url, type, null))
    return null
  }
}

/**
 * Attaches the navigation's result to the pending transition that was created
 * at `start` and threaded through the action: the destination tree (the
 * identity HistoryUpdater will commit) and whether the router navigated into
 * cached UI. Called from the navigation code once the destination state
 * exists; writes into the shared object directly, so no lookup is needed.
 *
 * No-ops when `transition` is `null` (untracked navigation, or the lifecycle
 * is disabled). If the transition has already left the pending buffer — a
 * newer navigation committed first and this one was reported as aborted —
 * the write is harmless: events are only ever emitted for buffered entries,
 * and the action queue also discarded this navigation's state, so no commit
 * can fire for it either; the abort was final.
 */
export function attachRouterTransitionTarget(
  transition: PendingRouterTransition | null,
  tree: FlightRouterState,
  cacheHit: boolean
): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    if (transition === null) {
      return
    }
    transition.tree = tree
    transition.cacheHit = cacheHit
  }
}

/**
 * Emits `commit` for the transition whose destination `tree` is being applied
 * to the browser, and `abort` for every transition that started before it
 * (each superseded by this commit: the action queue discards a pending
 * navigation when a newer one is dispatched, so an older entry's state can
 * never be applied once a newer entry commits). Transitions that started
 * *after* the committing one are left in the buffer — they are still in
 * flight and will produce their own commit or abort.
 *
 * Runs from HistoryUpdater's insertion effect, so the commit timestamp
 * reflects the moment the navigation is applied. Matching is by tree
 * identity, so this is a no-op for states that are not tracked transitions
 * (refresh, server action, retry) and for re-renders of an
 * already-committed state.
 */
export function commitRouterTransition(state: AppRouterState): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    if (pendingTransitions.length === 0) {
      return
    }
    const { tree, canonicalUrl, renderedSearch } = state
    const index = pendingTransitions.findIndex((entry) => entry.tree === tree)
    if (index === -1) {
      // Not a tracked transition (e.g. a refresh or server action). Leave any
      // in-flight transitions untouched.
      return
    }

    const committed = pendingTransitions[index]
    // Entries before `index` started earlier and are superseded; entries after
    // it are newer, still-running transitions and stay pending.
    const aborted = pendingTransitions.slice(0, index)
    pendingTransitions.splice(0, index + 1)

    const now = Date.now()
    const to = describeRouteForInstrumentation(
      tree,
      canonicalUrl,
      renderedSearch
    )
    callHooks((hooks) =>
      hooks.unstable_onRouterTransitionCommit?.(committed.url, committed.type, {
        id: committed.id,
        timestamp: now,
        toRenderedPathname: to.renderedPathname,
        toCanonicalUrl: to.canonicalUrl,
        toRouteTemplates: to.routeTemplates,
        toParams: to.params,
        toSearchParams: to.searchParams,
        cache: committed.cacheHit ? 'hit' : 'miss',
      })
    )
    for (const entry of aborted) {
      callHooks((hooks) =>
        hooks.unstable_onRouterTransitionAbort?.(entry.url, entry.type, {
          id: entry.id,
          timestamp: now,
          supersededByTransitionId: committed.id,
        })
      )
    }
  }
}

/**
 * Adapter from internal router state (the FlightRouterState tree, canonical
 * URL, and rendered search) to the shape we are comfortable exposing publicly
 * on instrumentation events — the flattened `from*` (start) / `to*` (commit)
 * fields. This is the single boundary where internal route structure is
 * translated for external consumption; it exists solely for the
 * instrumentation-client router transition hooks and must not be used for
 * anything else (in particular, nothing in the router may depend on its
 * output).
 */
function describeRouteForInstrumentation(
  tree: FlightRouterState,
  canonicalUrl: string,
  renderedSearch: string
): {
  renderedPathname: string
  canonicalUrl: string
  routeTemplates: string[]
  params: Array<string | string[]>
  searchParams: Record<string, string | string[]>
} {
  return {
    renderedPathname:
      extractPathFromFlightRouterState(tree) ??
      new URL(canonicalUrl, location.href).pathname,
    canonicalUrl,
    routeTemplates: getRouteTemplates(tree),
    params: getPositionalParams(tree),
    searchParams: parseSearchParams(renderedSearch),
  }
}

/**
 * Returns the route template paths for the tree, deepest (leaf page) first with
 * the primary `children` route ahead of parallel slots. Dynamic segments are
 * rendered as positional holes (`:1`, `:2`, ...) rather than param names, so a
 * `[param]` folder rename does not break log continuity. These are route-path
 * templates, not filesystem paths: the `app`/`src/app` root and the
 * `page`/`layout` suffix are not knowable on the client.
 */
function getRouteTemplates(tree: FlightRouterState): string[] {
  const routes: Array<{ path: string; primary: boolean }> = []

  function visit(
    node: FlightRouterState,
    segments: string[],
    holeCount: number,
    primary: boolean
  ): void {
    const rawSegment = node[0]
    let rendered: string | null
    let nextHoleCount = holeCount
    if (Array.isArray(rawSegment)) {
      rendered = `:${++nextHoleCount}`
    } else {
      const source = segmentToSourcePagePathname(rawSegment)
      if (source === 'page') {
        routes.push({ path: `/${segments.join('/')}`, primary })
        return
      }
      if (source === '' || source === '(__SLOT__)' || isGroupSegment(source)) {
        rendered = null
      } else if (source === DEFAULT_SEGMENT_KEY) {
        rendered = 'default'
      } else if (source === NOT_FOUND_SEGMENT_KEY) {
        rendered = '_not-found'
      } else {
        rendered = source
      }
    }

    const nextSegments = rendered === null ? segments : [...segments, rendered]
    const parallelRoutes = node[1]
    const keys = Object.keys(parallelRoutes)

    if (keys.length === 0) {
      routes.push({ path: `/${nextSegments.join('/')}`, primary })
      return
    }

    if (parallelRoutes.children !== undefined) {
      visit(parallelRoutes.children, nextSegments, nextHoleCount, primary)
    }
    for (const key of keys.sort()) {
      if (key === 'children') {
        continue
      }
      visit(
        parallelRoutes[key],
        [...nextSegments, `@${key}`],
        nextHoleCount,
        false
      )
    }
  }

  visit(tree, [], 0, true)
  return routes
    .sort((a, b) => {
      if (a.primary !== b.primary) {
        return a.primary ? -1 : 1
      }
      return a.path.localeCompare(b.path)
    })
    .map((route) => route.path)
}

/**
 * Collects dynamic param values along the primary `children` chain, positional
 * by hole order so they line up with the holes in the primary route template.
 * Catch-all values are returned as an array of path segments.
 */
function getPositionalParams(
  tree: FlightRouterState
): Array<string | string[]> {
  const params: Array<string | string[]> = []

  function visit(node: FlightRouterState): void {
    const segment = node[0]
    if (Array.isArray(segment)) {
      const value = segment[1]
      const dynamicParamType = segment[2]
      params.push(
        dynamicParamType === 'c' || dynamicParamType === 'oc'
          ? value.split('/')
          : value
      )
    }
    const children = node[1].children
    if (children !== undefined) {
      visit(children)
    }
  }

  visit(tree)
  return params
}

function parseSearchParams(
  renderedSearch: string
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  const searchParams = new URLSearchParams(renderedSearch)
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key)
    result[key] = values.length > 1 ? values : values[0]
  }
  return result
}
