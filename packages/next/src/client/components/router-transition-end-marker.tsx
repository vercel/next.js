'use client'

import { createContext, useContext, useInsertionEffect, useRef } from 'react'
import {
  reportRouterTransitionEnd,
  type PendingRouterTransition,
} from './router-transition'

/**
 * Exposes the transition carried by the current router state
 * (`AppRouterState.instrumentationTransition`) to end markers. Provided by
 * AppRouter (only when the experimental lifecycle flag is on), so the value
 * is fixed during the render that produces each React commit. That
 * render-time binding is what makes attribution independent of effect
 * order: a marker mounting in the very commit that applies a navigation
 * read that navigation's transition when it rendered, whether its insertion
 * effect runs before or after HistoryUpdater's; and a marker revealed by
 * streamed content later attributes to whatever navigation's state was
 * current when React retried its Suspense boundary — the page the user is
 * actually on.
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
 * Reporting is once per navigation, on mount: whichever marker shows first
 * ends the transition, and additional markers (parallel routes, an
 * alternative marker inside `error.js`) are no-ops after it. A marker that
 * stays mounted across a navigation (e.g. in a shared layout) does not
 * re-report — nothing new was shown — which is why markers belong in
 * page-level content. Routes that render no marker simply produce no `end`
 * event.
 */
function RouterTransitionEndMarker(): null {
  const transition = useContext(RouterTransitionEndContext)
  // Reporting is keyed to this marker instance's mount: `transition` is in
  // the effect's dependencies only because it is read inside, so the ref
  // latch keeps the effect from re-reporting when a navigation swaps the
  // context value under a still-mounted marker. (Cross-marker and
  // StrictMode-replay dedupe live in the transition's own phase latch; this
  // ref only pins "mount" semantics.)
  const didReport = useRef(false)
  useInsertionEffect(() => {
    if (!didReport.current) {
      didReport.current = true
      reportRouterTransitionEnd(transition)
    }
  }, [transition])
  return null
}

// Exported under the unstable_ prefix (the public name while the lifecycle
// is experimental); the component is defined under its plain name because
// hooks lint requires component names to start with an uppercase letter.
export { RouterTransitionEndMarker as unstable_RouterTransitionEndMarker }
