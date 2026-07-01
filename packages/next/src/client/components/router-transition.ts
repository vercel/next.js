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
import type {
  ClientInstrumentationHooks,
  ClientInstrumentationModules,
  RouterTransitionType,
  RouterTreeDescriptor,
} from '../router-transition-types'

// An in-flight transition that has emitted `start` and is waiting to either
// commit or be aborted. Keyed by `tree`: HistoryUpdater commits whichever
// AppRouterState it observes, and `tree` is the unique, reference-stable
// identity of that state (a fresh FlightRouterState is built for every
// navigation), so it correlates the commit back to its start without threading
// an id through the router state.
type PendingTransition = {
  tree: FlightRouterState
  id: string
  type: RouterTransitionType
  url: string
  outcome: 'hit' | 'miss'
}

let instrumentationModules: readonly ClientInstrumentationHooks[] = []
let nextTransitionId = 0
// In-flight transitions. When one commits, every other entry is reported as
// aborted (superseded by the committer). Only populated when the experimental
// flag is on, so it tree-shakes away in the default build.
const pendingTransitions: PendingTransition[] = []

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
 * lifecycle is enabled, mints the transition id that ties `start` to its
 * eventual `commit`/`abort`. Called from the reducer at the navigation's
 * canonical timestamp (`Date.now()`), so a single clock is shared by the id and
 * every event for the transition.
 *
 * Returns the id when the lifecycle is active (the caller buffers it once the
 * destination tree exists), or `null` for the legacy two-argument hook.
 */
export function startRouterTransition(
  url: string,
  type: RouterTransitionType,
  fromTree: FlightRouterState,
  fromCanonicalUrl: string,
  fromRenderedSearch: string,
  now: number
): string | null {
  // Positive flag check so the instrumentation-only path is removed by DCE when disabled.
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    if (!hasLifecycleInstrumentation()) {
      return null
    }

    const id = `${now.toString(36)}-${(++nextTransitionId).toString(36)}`
    const descriptor = createTreeDescriptor(
      fromTree,
      fromCanonicalUrl,
      fromRenderedSearch
    )

    callHooks((hooks) =>
      hooks.onRouterTransitionStart?.(url, type, {
        id,
        timestamp: now,
        fromTree: descriptor,
      })
    )
    return id
  } else {
    callHooks((hooks) => hooks.onRouterTransitionStart?.(url, type, null))
    return null
  }
}

/**
 * Records an in-flight transition so it can later be committed or aborted.
 * Called once the navigation has produced its destination tree.
 */
export function bufferRouterTransition(
  id: string,
  tree: FlightRouterState,
  type: RouterTransitionType,
  url: string,
  outcome: 'hit' | 'miss'
): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    pendingTransitions.push({ tree, id, type, url, outcome })
  }
}

/**
 * Emits `commit` for the transition whose destination `tree` is being applied
 * to the browser, and `abort` for every other in-flight transition (each
 * superseded by this commit). Runs from HistoryUpdater's insertion effect, so
 * the commit timestamp reflects the moment the navigation is applied. A retry
 * builds a different tree that is not in the buffer, so commit fires at most
 * once per transition (at the prefetched shell, not at stream end).
 */
export function commitRouterTransition(
  tree: FlightRouterState,
  canonicalUrl: string,
  renderedSearch: string
): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    if (pendingTransitions.length === 0) {
      return
    }
    const index = pendingTransitions.findIndex((entry) => entry.tree === tree)
    if (index === -1) {
      // Not a tracked transition (e.g. a refresh or server action). Leave any
      // in-flight transitions untouched.
      return
    }

    const committed = pendingTransitions[index]
    const aborted = pendingTransitions.filter((_, i) => i !== index)
    // A commit drains the buffer: the committer commits, everything else is
    // superseded.
    pendingTransitions.length = 0

    const now = Date.now()
    const toTree = createTreeDescriptor(tree, canonicalUrl, renderedSearch)
    callHooks((hooks) =>
      hooks.unstable_onRouterTransitionCommit?.(committed.url, committed.type, {
        id: committed.id,
        timestamp: now,
        toTree,
        outcome: committed.outcome,
      })
    )
    for (const entry of aborted) {
      callHooks((hooks) =>
        hooks.unstable_onRouterTransitionAbort?.(entry.url, entry.type, {
          id: entry.id,
          timestamp: now,
          cause: committed.id,
        })
      )
    }
  }
}

function createTreeDescriptor(
  tree: FlightRouterState,
  canonicalUrl: string,
  renderedSearch: string
): RouterTreeDescriptor {
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
