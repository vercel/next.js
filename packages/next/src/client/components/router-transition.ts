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
import type { AppRouterState } from './router-reducer/router-reducer-types'
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
// code that produces the destination state writes into this same shared
// object (via `attachRouterTransitionTarget`) rather than look it up by id.
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
   * The destination state's tree, attached by the reducer once that state
   * exists (`null` until then). A fresh FlightRouterState is built for every
   * navigation, so this is the reference-stable identity that lets
   * HistoryUpdater match the state it commits back to this transition,
   * without leaking an instrumentation field into the router state itself.
   */
  tree: FlightRouterState | null
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
// replaced (aborted), and HistoryUpdater needs to find the transition
// whose tree it just applied. Only populated when the experimental flag is
// on. (A plain array on purpose: it rarely holds more than a couple of
// entries, and commit needs positional slicing.)
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
          from === null ? null : { id, timestamp: now, from }
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
 * Attaches the destination tree — the identity HistoryUpdater matches on to
 * report the commit — to the pending transition that was created at `start`
 * and threaded through the action. Called once the destination state exists.
 *
 * No-ops when `transition` is `null` (untracked navigation, or the lifecycle
 * is disabled). If the transition was already reported as aborted, the write
 * is harmless: events are only emitted for buffered entries, and the action
 * queue also discarded this navigation's state, so no commit can fire for it.
 */
export function attachRouterTransitionTarget(
  transition: PendingRouterTransition | null,
  tree: FlightRouterState
): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    if (transition === null) {
      return
    }
    transition.tree = tree
  }
}

/**
 * Re-points a pending transition's destination identity when an untracked
 * action derives a new state from a tracked-but-not-yet-committed one.
 *
 * A refresh (or a retry after a tree mismatch) mints a fresh tree from
 * whatever state is current when its reducer runs. If that base state is the
 * still-uncommitted destination of an in-flight navigation — e.g. a click
 * handler calls `router.push('/dest')` and `router.refresh()` in the same
 * tick — React may batch the two updates so that only the derived tree ever
 * reaches HistoryUpdater: the navigation's own tree is never applied
 * individually, and its commit would starve. Because these derivations land
 * the user on the same
 * destination the navigation targeted (a refresh re-fetches the current URL;
 * a retry replaces the tree with the server's authoritative version of it),
 * the transition's identity follows the derivation, and the eventual commit
 * is reported against the derived tree instead. This also keeps the reported
 * events independent of whether React happened to batch: the non-batched
 * interleaving commits the navigation's own tree first, and the retarget
 * no-ops.
 *
 * No-op in the common case where `fromTree` belongs to no pending transition
 * (the base state was already committed, or nothing is in flight).
 */
export function retargetRouterTransition(
  fromTree: FlightRouterState,
  toTree: FlightRouterState
): void {
  if (process.env.__NEXT_INSTRUMENTATION_CLIENT_ROUTER_TRANSITION_EVENTS) {
    for (const transition of pendingTransitions) {
      if (transition.tree === fromTree) {
        transition.tree = toTree
        return
      }
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
 * Stops tracking a transition that can no longer commit: the action queue
 * calls this when a navigate/restore action settles without attaching a
 * destination tree (e.g. a push while offline whose fetch rejects, or a
 * navigation the server answers with a redirect to another origin, which
 * falls back to a full-page/MPA navigation) and when a reducer throws.
 * Without it, the entry would linger in `pendingTransitions`
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
 * Emits `commit` for the transition whose destination `tree` is being applied
 * to the browser, and `abort` for every transition that started before it
 * (each replaced by this commit: the action queue discards a pending
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
    // Entries before `index` started earlier and are replaced; entries after
    // it are newer, still-running transitions and stay pending.
    const aborted = pendingTransitions.slice(0, index)
    pendingTransitions.splice(0, index + 1)

    const now = Date.now()
    if (hasCommitHook) {
      // Skipped when no module registered a commit hook — the route
      // description has no other consumer. If describing fails, the commit
      // event is dropped (its payload can't be built), but the bookkeeping
      // above already ran and the aborts below still fire: the buffer must
      // not desync from the state the browser actually applied.
      const to = describeRouteForInstrumentationSafely(
        tree,
        canonicalUrl,
        renderedSearch
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
 * with the dynamic param values that fill that template's holes — the primary
 * (leaf page) route first, then parallel slots in stable alphabetical order.
 *
 * Templates render dynamic segments as positional holes (`:1`, `:2`, ...)
 * rather than param names, so a `[param]` folder rename does not break log
 * continuity. Hole numbering is per-branch: a hole's number is its position
 * along its own template's path. Given:
 *
 *   app/[locale]/blog/[slug]/page.tsx          → "/:1/blog/:2"
 *   app/[locale]/@sidebar/tags/[tag]/page.tsx  → "/:1/@sidebar/tags/:2"
 *
 * each branch numbers its own holes, continuing from the shared prefix
 * (`:1` is [locale] in both), so the two `:2`s name different params
 * ([slug] vs [tag]) and a template never changes because a *sibling* route
 * gained or lost a dynamic segment.
 *
 * The cost of per-branch numbering is exactly that `:2` collision, which is
 * why params are scoped to each template instead of pooled per event:
 * `params[i]` fills `:(i+1)` of that template only. A value on a shared
 * prefix repeats in every template rendered beneath it — `/en/blog/hello`
 * with the sidebar rendering `/en/tags/js` reports
 * `[{ template: "/:1/blog/:2", params: ["en", "hello"] },
 *   { template: "/:1/@sidebar/tags/:2", params: ["en", "js"] }]`, each entry
 * joinable on its own. (Both walks are one traversal here on purpose —
 * splitting them is how templates and params drift apart.)
 *
 * These are route-path templates, not filesystem paths: the `app`/`src/app`
 * root and the `page`/`layout` suffix are not knowable on the client.
 */
function getRoutesForInstrumentation(
  tree: FlightRouterState
): RouterTransitionMatchedRoute[] {
  const routes: Array<{
    template: string
    params: Array<string | string[]>
    primary: boolean
  }> = []

  function visit(
    node: FlightRouterState,
    segments: string[],
    params: Array<string | string[]>,
    primary: boolean
  ): void {
    const rawSegment = node[0]
    let rendered: string | null
    let nextParams = params
    if (Array.isArray(rawSegment)) {
      // A dynamic segment: [paramName, value, paramType]. Render a positional
      // hole and record its value in the same step — `nextParams.length`
      // doubles as the hole counter, since every hole records exactly one
      // value. A catch-all matches multiple path segments, so its value is
      // reported as the array of segments.
      const value = rawSegment[1]
      const paramType = rawSegment[2]
      nextParams = [
        ...params,
        isCatchAllParamType(paramType) ? value.split('/') : value,
      ]
      rendered = `:${nextParams.length}`
    } else {
      const source = segmentToSourcePagePathname(rawSegment)
      if (source === 'page') {
        // The page segment terminates a template. Its params are exactly the
        // values collected on the path from the root, in hole order.
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
    // shared prefix) and extend it independently — this is what makes hole
    // numbering per-branch and shared-prefix values repeat per template.
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

  visit(tree, [], [], true)
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
