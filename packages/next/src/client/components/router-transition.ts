import type { FlightRouterState } from '../../shared/lib/app-router-types'
import {
  DEFAULT_SEGMENT_KEY,
  isCatchAllParamType,
  isGroupSegment,
  NOT_FOUND_SEGMENT_KEY,
} from '../../shared/lib/segment'
import { searchParamsToUrlQuery } from '../../shared/lib/router/utils/querystring'
import {
  extractPathFromFlightRouterState,
  segmentToSourcePagePathname,
} from './router-reducer/compute-changed-path'
import {
  ACTION_HMR_REFRESH,
  ACTION_NAVIGATE,
  ACTION_REFRESH,
  ACTION_RESTORE,
  ACTION_SERVER_ACTION,
  ACTION_SERVER_PATCH,
  type AppRouterState,
  type ReducerActions,
} from './router-reducer/router-reducer-types'
import type {
  ClientInstrumentationHooks,
  ClientInstrumentationModules,
  RouterTransitionMatchedRoute,
  RouterTransitionRoute,
  RouterTransitionType,
} from '../router-transition-types'

// The single tracking record for one tracked transition, used only by the
// instrumentation-client router transition hooks. Created when `start` is
// emitted and threaded through the navigate/restore action, so the navigation
// code that produces the destination state stamps this same shared object
// onto the state (`AppRouterState.instrumentationTransition`) rather than
// look it up by id.
export type PendingRouterTransition = {
  /** Opaque id shared by every event emitted for this transition. */
  id: string
  type: RouterTransitionType
  /**
   * The destination exactly as the `start` hook reported it. The state's
   * `canonicalUrl` is the post-navigation, post-redirect href and can differ
   * from it in both form and value — e.g. a push to `/old-blog/hello` that
   * the server redirects reports `url: "/old-blog/hello"` on every event,
   * while the committed state's `canonicalUrl` is `/blog/hello`. Reporting
   * the same string on start/commit/abort is what lets consumers correlate
   * the events.
   */
  url: string
  /**
   * Where the transition is in its reportable lifecycle. `pending` from
   * start until HistoryUpdater applies a state carrying this transition
   * (`AppRouterState.instrumentationTransition`), `committed` once `commit`
   * has been emitted. A one-way latch: it only advances, which is what makes
   * the emission point idempotent against re-renders, StrictMode double
   * effects, and derived states (refreshes) that carry an already-reported
   * transition.
   */
  phase: 'pending' | 'committed'
  /**
   * Whether the action queue discarded this transition's action because a
   * newer navigation was dispatched. A replaced transition's state can never
   * be applied, so it can no longer commit — it stays buffered only to be
   * reported as aborted by the commit that ends its replacement race, and is
   * dropped if that race dies out without any commit
   * (see `sweepReplacedRouterTransitions`).
   */
  replaced: boolean
}

let instrumentationModules: readonly ClientInstrumentationHooks[] = []
let nextTransitionId = 0
// In-flight transitions, in start order (oldest first). The entries are the
// same objects threaded through the actions — the buffer exists for the
// cross-transition bookkeeping a single threaded object can't provide:
// commit needs the start *order* to know which older transitions were
// replaced (aborted). Only populated when the experimental flag is on. (A
// plain array on purpose: it rarely holds more than a couple of entries, and
// commit needs positional slicing.)
const pendingTransitions: PendingRouterTransition[] = []

// Which hooks exist is precomputed at initialization (the module list is
// fixed once hydration runs) so the per-navigation code can cheaply skip
// building event payloads no registered hook would receive.
let hasStartHook = false
let hasCommitHook = false
let hasAbortHook = false

export function initializeRouterTransitionModules(
  modules: ClientInstrumentationModules
): void {
  instrumentationModules = modules.filter(
    (module): module is ClientInstrumentationHooks => module != null
  )
  hasStartHook = instrumentationModules.some(
    (hooks) => typeof hooks.onRouterTransitionStart === 'function'
  )
  hasCommitHook = instrumentationModules.some(
    (hooks) => typeof hooks.unstable_onRouterTransitionCommit === 'function'
  )
  hasAbortHook = instrumentationModules.some(
    (hooks) => typeof hooks.unstable_onRouterTransitionAbort === 'function'
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
  return hasStartHook || hasCommitHook || hasAbortHook
}

/**
 * Event timestamps are high-resolution wall-clock time derived from the
 * monotonic clock (`timeOrigin` is fixed at page load; `now()` only moves
 * forward) rather than `Date.now()`, which can step backwards under NTP
 * adjustment — and would let a commit report an earlier timestamp than its
 * own start.
 */
function timestamp(): number {
  return performance.timeOrigin + performance.now()
}

/**
 * Emits the `start` event for a navigation and, when the experimental
 * lifecycle is enabled, begins tracking it: the transition is recorded in
 * `pendingTransitions` immediately, so that it is reported as aborted if a
 * newer navigation commits before this one produces a destination tree.
 *
 * The `from` route describes the route being left; it is read from the
 * current AppRouterState here (rather than passed in) since this is the only
 * transition hook that needs it.
 *
 * Returns the pending transition when the lifecycle is active — the caller
 * puts the object on the dispatched action so the queue can settle it
 * (attach the destination tree, or untrack it) when the action completes —
 * or `null` for the legacy two-argument hook.
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

    const id = `${Date.now().toString(36)}-${(++nextTransitionId).toString(36)}`
    const transition: PendingRouterTransition = {
      id,
      type,
      url,
      phase: 'pending',
      replaced: false,
    }
    pendingTransitions.push(transition)

    if (hasStartHook) {
      // Skipped when no module registered a start hook: the route description
      // (two tree walks plus URL/search parsing) has no other consumer. On a
      // describe failure the hook receives `null`, the legacy event shape.
      const from = describeRouteForInstrumentationSafely(
        state.tree,
        state.canonicalUrl,
        state.renderedSearch
      )
      callHooks((hooks) =>
        hooks.onRouterTransitionStart?.(
          url,
          type,
          from === null ? null : { id, timestamp: timestamp(), from }
        )
      )
    }
    return transition
  } else {
    callHooks((hooks) => hooks.onRouterTransitionStart?.(url, type, null))
    return null
  }
}

/**
 * Narrows to the action types that carry a tracked transition — only
 * navigate/restore actions emit `start` and thread the pending transition
 * object through the queue.
 */
export function getInstrumentationTransition(
  payload: ReducerActions
): PendingRouterTransition | null {
  return payload.type === ACTION_NAVIGATE || payload.type === ACTION_RESTORE
    ? payload.instrumentationTransition
    : null
}

/**
 * Settles the transition lifecycle for one action, called from the action
 * queue's single settle point with the state the reducer derived from
 * (`prevState`) and the state it produced (`nextState`). Every action type
 * must be classified by what it does to the router's current destination —
 * the `satisfies never` default makes a new action type fail to compile
 * until it declares its semantics here, instead of silently starving or
 * misattributing commits.
 *
 * The classes:
 *
 * - Destination-setting (navigate, traverse): the produced state IS the
 *   action's transition destination — the reducer stamped the transition
 *   onto it (`AppRouterState.instrumentationTransition`), the identity
 *   HistoryUpdater reads to report the commit. A reducer that settled
 *   without producing a new SPA state — it fell back to the current state
 *   because e.g. the dynamic fetch rejected, or bailed out to a full-page
 *   (MPA) navigation — is untracked: its transition can never commit, and
 *   leaving it buffered would misreport it as "replaced" by a later,
 *   unrelated commit. Every failure path returns the base state object
 *   itself and every MPA path sets `pushRef.mpaNavigation`, so identity and
 *   that flag are the signal.
 *
 * - Destination-preserving (refresh, server patch/retry, HMR refresh): the
 *   produced state re-derives whatever destination the base state
 *   represented, minting a fresh tree for the same place, and carries the
 *   base state's transition forward (the reducer copies the field). If that
 *   base state was the not-yet-committed destination of an in-flight
 *   navigation, React may batch the two updates so only the derived state
 *   ever reaches HistoryUpdater, which would starve the navigation's commit
 *   — the carried field is what lets the derived state commit it. This is
 *   safe under either interleaving: if React does not batch, the
 *   navigation's own state commits first and the derived state's commit
 *   no-ops (the transition's phase has already advanced). Because the
 *   carry-over lives in the reducers, these actions need nothing from the
 *   settle point.
 *
 * - Server actions are preserving only when they did not navigate: a
 *   revalidation re-renders the current URL (same reasoning as refresh, and
 *   its reducer carries the transition the same way), but a redirect
 *   produces a destination no tracked transition targeted, so the reducer
 *   stamps `null` and the pending transition is left untouched there.
 *   TODO: give server-action navigations first-class transitions (they
 *   currently emit no events at all); that turns the redirect case into a
 *   normal replacement race instead of this gap.
 */
export function settleRouterTransition(
  payload: ReducerActions,
  prevState: AppRouterState,
  nextState: AppRouterState
): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    switch (payload.type) {
      case ACTION_NAVIGATE:
      case ACTION_RESTORE: {
        const transition = payload.instrumentationTransition
        if (transition === null) {
          // Untracked: the lifecycle is disabled, or a non-navigation restore
          // (a BFCache revival or a pushState/replaceState sync).
          return
        }
        if (nextState === prevState || nextState.pushRef.mpaNavigation) {
          untrackRouterTransition(transition)
        }
        // Otherwise the destination state carries the transition (stamped
        // where the state was built) and HistoryUpdater reports the commit.
        return
      }
      case ACTION_REFRESH:
      case ACTION_SERVER_PATCH:
      case ACTION_HMR_REFRESH:
      case ACTION_SERVER_ACTION:
        // Destination-preserving: the reducer carried the base state's
        // transition onto the derived state (see the class descriptions
        // above), so there is nothing left to settle here.
        return
      default:
        payload satisfies never
    }
  }
}

/**
 * Marks a transition as replaced: the action queue calls this when it
 * discards a pending navigate/restore action because a newer navigation was
 * dispatched. A replaced transition's state can never be applied, so it can
 * no longer commit — but it stays buffered so it is reported correctly when
 * its replacement race settles: aborted by the commit that ends the race, or
 * dropped without a terminal event if every navigation in the race dies
 * without committing (see `sweepReplacedRouterTransitions`).
 */
export function markRouterTransitionAsReplaced(
  transition: PendingRouterTransition | null
): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    if (transition !== null) {
      transition.replaced = true
    }
  }
}

/**
 * Stops tracking a transition that can no longer commit: called from
 * `settleRouterTransition` when a navigation settles without producing a
 * committable destination (e.g. a push while offline whose fetch rejects, or
 * a navigation the server answers with a redirect to another origin, which
 * falls back to a full-page/MPA navigation) and from the action queue when a
 * reducer throws. Without it, the entry would linger in `pendingTransitions`
 * and be misreported as "aborted, replaced by" a later, unrelated commit —
 * an abort must only ever mean "a newer navigation committed before this one
 * could". The consumer-visible result is a `start` with no terminal event.
 *
 * TODO: emit a dedicated terminal event (e.g. an abort with a reason field,
 * or a failure hook) so consumers can distinguish failed and full-page
 * navigations from transitions that are still in flight.
 */
export function untrackRouterTransition(
  transition: PendingRouterTransition | null
): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    if (transition === null) {
      return
    }
    const index = pendingTransitions.indexOf(transition)
    if (index !== -1) {
      pendingTransitions.splice(index, 1)
      sweepReplacedRouterTransitions()
    }
  }
}

/**
 * Drops replaced transitions once no live (non-replaced) transition remains.
 * A replaced entry can only be terminally reported by the commit of a live
 * transition — its replacer, or transitively that replacer's replacer — so
 * when the last live transition is untracked (failed or fell back to a
 * full-page navigation) or commits, nothing can legitimately claim the
 * leftovers. Leaving them buffered would let the next unrelated navigation's
 * commit misreport them as its own aborts, with a `replacedBy` id the
 * consumer never saw racing them. Like a failed navigation, a dropped
 * entry's consumer-visible result is a `start` with no terminal event.
 */
function sweepReplacedRouterTransitions(): void {
  if (
    pendingTransitions.length > 0 &&
    pendingTransitions.every((entry) => entry.replaced)
  ) {
    pendingTransitions.length = 0
  }
}

/**
 * Emits `commit` for the transition carried by the state being applied to
 * the browser (`state.instrumentationTransition`), and `abort` for every
 * transition that started before it (each replaced by this commit: the
 * action queue discards a pending navigation when a newer one is dispatched,
 * so an older entry's state can never be applied once a newer entry
 * commits). Transitions that started *after* the committing one are left in
 * the buffer — they are still in flight and will produce their own commit
 * or abort.
 *
 * Runs from HistoryUpdater's insertion effect, so the commit timestamp
 * reflects the moment the navigation is applied. The phase latch makes this
 * a no-op for states that carry no tracked transition (server actions), for
 * re-renders of an already-committed state, and for derived states
 * (refreshes) that carry a transition another state already committed.
 */
export function commitRouterTransition(state: AppRouterState): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    const committed = state.instrumentationTransition
    if (committed === null || committed.phase !== 'pending') {
      return
    }
    committed.phase = 'committed'

    const index = pendingTransitions.indexOf(committed)
    // Entries before `index` started earlier and are replaced; entries after
    // it are newer, still-running transitions and stay pending. A pending
    // transition is always in the buffer (untracking is what removes it, and
    // an untracked transition's state never commits), so `index` can't be
    // -1 — but degrade to aborting nothing rather than aborting everything
    // if that invariant is ever broken.
    const aborted = index === -1 ? [] : pendingTransitions.slice(0, index)
    pendingTransitions.splice(0, index + 1)

    const now = timestamp()
    if (hasCommitHook) {
      // Skipped when no module registered a commit hook — the route
      // description has no other consumer. If describing fails, the commit
      // event is dropped (its payload can't be built), but the bookkeeping
      // above already ran and the aborts below still fire: the buffer must
      // not desync from the state the browser actually applied.
      const to = describeRouteForInstrumentationSafely(
        state.tree,
        state.canonicalUrl,
        state.renderedSearch
      )
      if (to !== null) {
        callHooks((hooks) =>
          hooks.unstable_onRouterTransitionCommit?.(
            committed.url,
            committed.type,
            {
              id: committed.id,
              timestamp: now,
              to,
            }
          )
        )
      }
    }
    for (const entry of aborted) {
      callHooks((hooks) =>
        hooks.unstable_onRouterTransitionAbort?.(entry.url, entry.type, {
          id: entry.id,
          timestamp: now,
          replacedBy: committed.id,
        })
      )
    }
    // Entries newer than the committed one stay pending, but if all of them
    // were already replaced, their race can no longer produce a commit.
    sweepReplacedRouterTransitions()
  }
}

/**
 * `describeRouteForInstrumentation` behind a guard, because it runs on
 * navigation code paths: `start` builds its payload synchronously inside the
 * dispatch call stack and `commit` inside HistoryUpdater's insertion effect,
 * so an exception escaping here would break the navigation itself — and
 * instrumentation must never affect navigation. No known input throws today;
 * this exists so a future gap in the describe logic degrades the event
 * instead of the navigation. Returns `null` on failure.
 */
function describeRouteForInstrumentationSafely(
  tree: FlightRouterState,
  canonicalUrl: string,
  renderedSearch: string
): RouterTransitionRoute | null {
  try {
    return describeRouteForInstrumentation(tree, canonicalUrl, renderedSearch)
  } catch (error) {
    console.error(
      'Failed to describe a route for an instrumentation-client router transition event',
      error
    )
    return null
  }
}

/**
 * Adapter from internal router state (the FlightRouterState tree, canonical
 * URL, and rendered search) to the shape we are comfortable exposing publicly
 * on instrumentation events — the `from` (start) / `to` (commit) route
 * objects. This is the single boundary where internal route structure is
 * translated for external consumption; it exists solely for the
 * instrumentation-client router transition hooks and must not be used for
 * anything else (in particular, nothing in the router may depend on its
 * output).
 */
function describeRouteForInstrumentation(
  tree: FlightRouterState,
  canonicalUrl: string,
  renderedSearch: string
): RouterTransitionRoute {
  return {
    renderedPathname:
      extractPathFromFlightRouterState(tree) ??
      new URL(canonicalUrl, location.href).pathname,
    canonicalUrl,
    routes: getRoutesForInstrumentation(tree),
    searchParams: parseSearchParams(renderedSearch),
  }
}

/**
 * Returns the rendered routes for the tree — each a route template paired
 * with the dynamic param values that fill it — the primary (leaf page) route
 * first, then parallel slots in stable alphabetical order.
 *
 * Templates render dynamic segments in their source notation (`[slug]`,
 * `[...parts]`), with param values keyed by name. Params are scoped to each
 * template rather than pooled per event: parallel branches can bind the same
 * param name to different values (e.g. an intercepted route's `[id]` vs a
 * sibling slot's `[id]`), and a value on a shared prefix simply repeats in
 * every template rendered beneath it, so each entry is joinable on its own.
 * (Both walks are one traversal here on purpose — splitting them is how
 * templates and params drift apart.)
 *
 * These are route-path templates, not filesystem paths: the `app`/`src/app`
 * root and the `page`/`layout` suffix are not knowable on the client.
 */
function getRoutesForInstrumentation(
  tree: FlightRouterState
): RouterTransitionMatchedRoute[] {
  const routes: Array<{
    template: string
    params: Record<string, string | string[]>
    primary: boolean
  }> = []

  function visit(
    node: FlightRouterState,
    segments: string[],
    params: Record<string, string | string[]>,
    primary: boolean
  ): void {
    const rawSegment = node[0]
    let rendered: string | null
    let nextParams = params
    if (Array.isArray(rawSegment)) {
      // A dynamic segment: [paramName, value, paramType]. A catch-all matches
      // multiple path segments, so its value is reported as the array of
      // segments.
      const [paramName, value, paramType] = rawSegment
      nextParams = {
        ...params,
        [paramName]: isCatchAllParamType(paramType) ? value.split('/') : value,
      }
      rendered = segmentToSourcePagePathname(rawSegment)
    } else {
      const source = segmentToSourcePagePathname(rawSegment)
      if (source === 'page') {
        // The page segment terminates a template. Its params are exactly the
        // values collected on the path from the root.
        routes.push({ template: `/${segments.join('/')}`, params, primary })
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
      routes.push({
        template: `/${nextSegments.join('/')}`,
        params: nextParams,
        primary,
      })
      return
    }

    // Sibling branches each receive the same `nextParams` (the values on the
    // shared prefix) and extend it independently — this is what makes
    // shared-prefix values repeat per template.
    if (parallelRoutes.children !== undefined) {
      visit(parallelRoutes.children, nextSegments, nextParams, primary)
    }
    for (const key of keys.sort()) {
      if (key === 'children') {
        continue
      }
      visit(
        parallelRoutes[key],
        [...nextSegments, `@${key}`],
        nextParams,
        false
      )
    }
  }

  visit(tree, [], {}, true)
  return routes
    .sort((a, b) => {
      if (a.primary !== b.primary) {
        return a.primary ? -1 : 1
      }
      return a.template.localeCompare(b.template)
    })
    .map((route) => ({ template: route.template, params: route.params }))
}

function parseSearchParams(
  renderedSearch: string
): Record<string, string | string[]> {
  // Delegates to the shared query-string semantics (single value → string,
  // repeated key → array of values). The cast strips ParsedUrlQuery's
  // `undefined` from the value type — searchParamsToUrlQuery never
  // assigns it.
  return searchParamsToUrlQuery(new URLSearchParams(renderedSearch)) as Record<
    string,
    string | string[]
  >
}
