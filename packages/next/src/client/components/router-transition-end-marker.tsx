'use client'

import {
  createContext,
  useContext,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import {
  reportRouterTransitionEnd,
  type PendingRouterTransition,
} from './router-transition'

/**
 * Exposes the transition carried by the current router state
 * (`AppRouterState.instrumentationTransition`) to end markers. Provided by
 * AppRouter (only when the experimental lifecycle flag is on), so the value
 * is fixed during the render that produces each React commit. That
 * render-time binding is what makes attribution exact: a marker mounting in
 * the very commit that applies a navigation read that navigation's
 * transition when it rendered, and a marker revealed by streamed content
 * later attributes to whatever navigation's state was current when React
 * retried its Suspense boundary — the page the user is actually on.
 */
export const RouterTransitionEndContext =
  createContext<PendingRouterTransition | null>(null)

/**
 * Declares "the page has loaded" for the instrumentation-client router
 * transition lifecycle: when the first marker rendered for a navigation's
 * destination is committed to the screen, the navigation's
 * `unstable_onRouterTransitionEnd` hook fires. Place it next to the content
 * whose visibility completes the page — typically inside the Suspense
 * boundary that streams in last — so `end - commit` measures the
 * post-navigation streaming/rendering cost the app actually cares about.
 * The marker renders nothing.
 *
 * JSX treats lowercase-first tags as host elements, so (like React's own
 * `unstable_`-prefixed components) the import must be aliased to a
 * capitalized name:
 *
 *     import { unstable_RouterTransitionEndMarker as RouterTransitionEndMarker } from 'next/navigation'
 *
 * Reporting is once per navigation, when the marker shows: whichever marker
 * shows first ends the transition, and additional markers (parallel routes,
 * an alternative marker inside `error.js`) are no-ops after it. "Shows"
 * means committed to the screen — a fresh mount, or an `<Activity>` reveal
 * when the router re-shows a preserved page (cacheComponents keeps visited
 * pages hidden in Activity boundaries, so a back/forward traversal reveals
 * the same marker instance instead of mounting a new one). A marker that
 * stays on screen across a navigation (e.g. in a shared layout) does not
 * re-report — nothing new was shown — which is why markers belong in
 * page-level content. Routes that render no marker simply produce no `end`
 * event.
 */
function RouterTransitionEndMarker(): null {
  const transition = useContext(RouterTransitionEndContext)
  // The reporting effect below deliberately has no dependencies, so it reads
  // the transition through a ref kept current on every render — by the time
  // any effect runs for a commit, the ref holds the transition of the router
  // state that produced that commit.
  const latestTransition = useRef(transition)
  useInsertionEffect(() => {
    latestTransition.current = transition
  }, [transition])
  // "Showing" is a layout effect on purpose, and with no dependencies on
  // purpose:
  //
  // - Layout effects are disconnected when an <Activity> hides the marker's
  //   page and reconnected when it is revealed, so the effect re-fires when a
  //   traversal re-shows a preserved page — the reveal IS the page loading,
  //   even though nothing remounted. (Insertion effects do not participate
  //   in Activity's disconnect/reconnect cycle, so they would miss reveals.)
  // - No dependencies means a navigation that merely swaps the context value
  //   under a marker that stayed on screen does not re-fire the effect —
  //   nothing new was shown. (Cross-marker, StrictMode-replay, and
  //   reveal-of-an-already-ended-transition dedupe all live in the
  //   transition's own phase latch.)
  //
  // Ordering: within a React commit, every insertion effect runs before any
  // layout effect, so HistoryUpdater has already emitted `commit` for the
  // state this marker rendered under — `end` is always reported after
  // `commit`.
  useLayoutEffect(() => {
    reportRouterTransitionEnd(latestTransition.current)
  }, [])
  return null
}

// Exported under the unstable_ prefix (the public name while the lifecycle
// is experimental); the component is defined under its plain name because
// hooks lint requires component names to start with an uppercase letter.
export { RouterTransitionEndMarker as unstable_RouterTransitionEndMarker }
