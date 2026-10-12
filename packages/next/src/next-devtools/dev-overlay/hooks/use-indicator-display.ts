import { useEffect, useReducer, useState } from 'react'
import type { CacheIndicatorState } from '../cache-indicator'
import {
  Status,
  getCurrentStatus,
} from '../components/devtools-indicator/status-indicator'

/**
 * The indicator commits to a displayed state for at least this long, in both
 * directions: activity must persist this long before the pill appears, and once
 * shown the pill lingers this long after activity ends before hiding. The exit
 * linger does double duty: it keeps any shown state visible for a minimum time
 * (no one-frame flash) and bridges brief gaps between rapid compile events
 * (intent returning within the window cancels the hide). The two never stack on
 * a single transition, so this is a single show-or-hide window, not a sum.
 * Matches the 200ms transition used elsewhere in the dev overlay (menu, instant
 * navigations).
 */
const INDICATOR_TRANSITION_MS = 200

// The cold-cache badge is gated behind an experimental flag while its UI/UX is
// iterated on. This is a build-time constant (DefinePlugin replaces it), and a
// Next config change restarts the dev server, so reading it once at module
// scope is safe.
const coldCacheBadgeEnabled = !!process.env.__NEXT_EXPERIMENTAL_COLD_CACHE_BADGE

type CacheBadge = 'cold' | 'bypass'

/**
 * What the dev-tools indicator should display right now: either a status pill
 * (rendering/compiling, or the bare logo when `None`) with no cache badge, or a
 * persistent "Cold cache" / "Cache disabled" badge with no pill.
 */
export type IndicatorDisplay =
  /**
   * A status pill (or the bare logo when `None`); no cache badge.
   */
  | { status: Status; cacheBadge: null }
  /**
   * A persistent cache badge; no status pill.
   */
  | { status: Status.None; cacheBadge: CacheBadge }

/**
 * The intent is the display we'd show immediately if there were no anti-flicker
 * timing: a pill while compiling/rendering, the persistent badge once a load
 * settled cold or with caches bypassed, otherwise nothing. It's derived from
 * the raw server signals on every render and fed into the state machine below.
 */
type Intent =
  | { kind: 'pill'; status: Status }
  | { kind: 'badge'; cache: CacheBadge }
  | { kind: 'idle' }

function computeIntent(
  building: boolean,
  rendering: boolean,
  cacheIndicator: CacheIndicatorState
): Intent {
  const status = getCurrentStatus(building, rendering, cacheIndicator)
  if (status !== Status.None) {
    return { kind: 'pill', status }
  }
  // The transient cold-cache rendering pill above is shown regardless of the
  // flag; only the persistent cold badge is gated. The pre-existing "Cache
  // disabled" (bypass) badge is unaffected.
  if (
    cacheIndicator === 'bypass' ||
    (cacheIndicator === 'cold' && coldCacheBadgeEnabled)
  ) {
    return { kind: 'badge', cache: cacheIndicator }
  }
  return { kind: 'idle' }
}

/**
 * The indicator is always in exactly one of these phases. `entering` and
 * `exiting` are the timed ones (a pending delay); the other three are stable
 * until the intent changes. A phase carries only the data it actually shows, so
 * the set of possible displays is exactly this union.
 */
type State =
  /**
   * Bare logo: nothing compiling, rendering, or left behind by a cold/bypassed
   * load.
   */
  | { phase: 'idle' }
  /**
   * A pill is wanted but is waiting out the delay, so brief activity never
   * flashes it. Meanwhile `under` keeps showing a badge carried from a prior
   * settled load (or the bare logo when null), so the badge -> pill handoff has
   * no gap. It is display-only: it is never restored as the settle target.
   */
  | { phase: 'entering'; status: Status; under: CacheBadge | null }
  /**
   * The rendering/compiling pill is shown.
   */
  | { phase: 'pill'; status: Status }
  /**
   * The pill is still shown but activity ended; it lingers out the delay before
   * hiding, which also bridges a brief gap if activity resumes.
   */
  | { phase: 'exiting'; status: Status }
  /**
   * The persistent "Cold cache" / "Cache disabled" badge is shown.
   */
  | { phase: 'badge'; badge: CacheBadge }

type Action = { type: 'intent'; intent: Intent } | { type: 'timer' }

/**
 * Transitions, driven by the current intent (pill / badge / idle) and, in the
 * two timed phases, by the delay elapsing. A `pill` intent in `entering` or
 * `pill` only relabels the status and stays in the same phase, so it never
 * restarts the delay and the label tracks the live state in real time.
 *
 *     from      | pill      | badge | idle     | timer
 *     ----------+-----------+-------+----------+--------
 *     idle      | entering  | badge | idle     | -
 *     entering  | entering  | badge | idle     | pill
 *     pill      | pill      | badge | exiting  | -
 *     exiting   | pill      | badge | exiting  | idle
 *     badge     | entering  | badge | idle     | -
 *
 * The `pill -> badge` cell is the atomic handoff: the pill becomes the
 * persistent badge in a single commit, so the indicator never blanks to the
 * bare logo between them.
 */
function reducer(state: State, action: Action): State {
  if (action.type === 'timer') {
    if (state.phase === 'entering') {
      return { phase: 'pill', status: state.status }
    }
    if (state.phase === 'exiting') {
      return { phase: 'idle' }
    }
    return state
  }

  const { intent } = action
  switch (state.phase) {
    case 'idle':
      if (intent.kind === 'pill') {
        return { phase: 'entering', status: intent.status, under: null }
      }
      if (intent.kind === 'badge') {
        return { phase: 'badge', badge: intent.cache }
      }
      return state

    case 'entering':
      if (intent.kind === 'pill') {
        return { phase: 'entering', status: intent.status, under: state.under }
      }
      if (intent.kind === 'badge') {
        return { phase: 'badge', badge: intent.cache }
      }
      // Settled with no cache verdict (the load was warm): clear. `under` only
      // keeps the display stable during the enter delay; it is never restored
      // as a fallback, otherwise a stale badge carried from the previous page
      // would reappear after navigating to a warm one.
      return { phase: 'idle' }

    case 'pill':
      if (intent.kind === 'pill') {
        return state.status === intent.status
          ? state
          : { phase: 'pill', status: intent.status }
      }
      if (intent.kind === 'badge') {
        return { phase: 'badge', badge: intent.cache }
      }
      return { phase: 'exiting', status: state.status }

    case 'exiting':
      if (intent.kind === 'pill') {
        return { phase: 'pill', status: intent.status }
      }
      if (intent.kind === 'badge') {
        return { phase: 'badge', badge: intent.cache }
      }
      return state

    case 'badge':
      if (intent.kind === 'pill') {
        return { phase: 'entering', status: intent.status, under: state.badge }
      }
      if (intent.kind === 'badge') {
        return state.badge === intent.cache
          ? state
          : { phase: 'badge', badge: intent.cache }
      }
      return { phase: 'idle' }
  }
}

/**
 * Owns the dev-tools indicator's displayed state as a single state machine,
 * driven by the raw server signals (compiling, rendering, cache status). It
 * absorbs brief activity before showing the rendering pill, bridges compile
 * gaps, and hands the pill off to the persistent cache badge atomically so the
 * indicator never collapses to a bare logo between the two.
 */
export function useIndicatorDisplay(
  building: boolean,
  rendering: boolean,
  cacheIndicator: CacheIndicatorState
): IndicatorDisplay {
  const intent = computeIntent(building, rendering, cacheIndicator)
  const [state, dispatch] = useReducer(reducer, intent, init)

  // Reconcile the current intent into the machine. Intent is derived from
  // props, so we apply it during render (React's "adjust state when an input
  // changed" pattern) guarded by a key, rather than from an effect that would
  // commit the stale state for a frame first.
  const key = intentKey(intent)
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    dispatch({ type: 'intent', intent })
  }

  // Run the delay for whichever timed phase we're in. Keyed on `phase` alone: a
  // status relabel keeps `phase === 'entering'` so the delay isn't restarted,
  // while entering a timed phase (a real phase change) starts a fresh one. The
  // cleanup clears a pending timer on any phase change, so it can't fire stale.
  const { phase } = state
  useEffect(() => {
    if (phase !== 'entering' && phase !== 'exiting') {
      return
    }
    const id = setTimeout(
      () => dispatch({ type: 'timer' }),
      INDICATOR_TRANSITION_MS
    )
    return () => clearTimeout(id)
  }, [phase])

  return toDisplay(state)
}

/**
 * A stable string identity for an intent, so the hook can tell when the derived
 * intent actually changed and only then feed it into the machine.
 */
function intentKey(intent: Intent): string {
  switch (intent.kind) {
    case 'pill':
      return `pill:${intent.status}`
    case 'badge':
      return `badge:${intent.cache}`
    case 'idle':
      return 'idle'
  }
}

/**
 * The phase to start in, so an indicator that mounts already active (or with a
 * cold/bypass verdict replayed on connect) shows the right thing immediately,
 * without waiting out an enter delay.
 */
function init(intent: Intent): State {
  switch (intent.kind) {
    case 'pill':
      return { phase: 'pill', status: intent.status }
    case 'badge':
      return { phase: 'badge', badge: intent.cache }
    case 'idle':
      return { phase: 'idle' }
  }
}

/**
 * Projects a phase onto the two-field display the component renders. This is
 * where the "status and cacheBadge are mutually exclusive" invariant is
 * enforced.
 */
function toDisplay(state: State): IndicatorDisplay {
  switch (state.phase) {
    case 'idle':
      return { status: Status.None, cacheBadge: null }
    case 'entering':
      return state.under === null
        ? { status: Status.None, cacheBadge: null }
        : { status: Status.None, cacheBadge: state.under }
    case 'pill':
    case 'exiting':
      return { status: state.status, cacheBadge: null }
    case 'badge':
      return { status: Status.None, cacheBadge: state.badge }
  }
}
