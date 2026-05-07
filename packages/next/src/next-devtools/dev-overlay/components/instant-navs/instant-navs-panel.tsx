import { useEffect, useSyncExternalStore } from 'react'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { usePanelRouterContext } from '../../menu/context'
import { ACTION_INSTANT_NAVS_RESET } from '../../shared'
import {
  useInstantNavCookieState,
  formatRoutePattern,
} from './instant-nav-cookie'
import './instant-navs-panel.css'
import type { InstantCookie } from '../../../../shared/lib/app-router-types'

const COOKIE_NAME = 'next-instant-navigation-testing'

// Module-level state machine for the "Continue Rendering" -> re-arm flow.
// The panel is a singleton in the dev overlay, so this is safe. Tracking
// the transition outside React lets us read/write it from both event
// handlers and effects without tripping React Compiler rules. The status
// is exposed to React via a useSyncExternalStore hook so the panel can
// re-render while we wait for the refresh to complete (otherwise the
// panel would flicker back to idle between the cookie delete and re-set).
type RearmStatus =
  | 'idle'
  // Waiting for the refresh action to start (renderingIndicator -> true).
  | 'awaiting-start'
  // Refresh in progress, waiting for it to finish (renderingIndicator -> false).
  | 'awaiting-end'
  // Refresh finished and the new pending cookie has been written; waiting
  // for the CookieStore change event to land so the panel can read it.
  // Keeping the status non-idle through this window prevents a flicker
  // back to the idle UI between cookie write and cookie change event.
  | 'awaiting-cookie'
let rearmAfterRefreshStatus: RearmStatus = 'idle'
const rearmSubscribers = new Set<() => void>()

function setRearmStatus(status: RearmStatus): void {
  if (rearmAfterRefreshStatus === status) return
  rearmAfterRefreshStatus = status
  for (const sub of rearmSubscribers) sub()
}

function subscribeRearm(cb: () => void): () => void {
  rearmSubscribers.add(cb)
  return () => rearmSubscribers.delete(cb)
}

function getRearmStatus(): RearmStatus {
  return rearmAfterRefreshStatus
}

function useRearmStatus(): RearmStatus {
  return useSyncExternalStore(subscribeRearm, getRearmStatus, getRearmStatus)
}

function clearInstantNavCaptureCookie(): void {
  setRearmStatus('idle')
  if (typeof cookieStore !== 'undefined') {
    cookieStore.delete(COOKIE_NAME)
  }
}

export function InstantNavsPanel() {
  const { state, dispatch } = useDevOverlayContext()
  const { panel } = usePanelRouterContext()

  // The cookie is the sole source of truth for the instant navigation
  // state, including the from-route URL for SPA captures.
  const cookieData = useInstantNavCookieState()

  const rearmStatus = useRearmStatus()

  // Cleanup on unmount: clear cookie and close the panel.
  useEffect(() => {
    return () => {
      clearInstantNavCaptureCookie()
      dispatch({ type: ACTION_INSTANT_NAVS_RESET })
    }
  }, [dispatch])

  // Panel routes stay mounted briefly for exit animations. Reset as soon as
  // close is requested so reopening during that animation starts fresh.
  useEffect(() => {
    if (panel !== 'instant-navs') {
      clearInstantNavCaptureCookie()
      dispatch({ type: ACTION_INSTANT_NAVS_RESET })
    }
  }, [panel, dispatch])

  function handleStartClientNav() {
    if (typeof cookieStore !== 'undefined') {
      const cookie: InstantCookie = [0, `p${Math.random()}`]
      cookieStore.set({
        name: COOKIE_NAME,
        value: JSON.stringify(cookie),
        path: '/',
      })
    }
  }

  // State machine for "Continue Rendering" in a captured state (mpa/spa):
  // delete the cookie (which triggers a soft refresh via the lock listener),
  // wait for the refresh to actually complete, then re-arm capture by
  // writing a new pending cookie. We observe completion by watching
  // state.renderingIndicator transition false -> true -> false, which is
  // driven by useTransition's isPending around the refresh dispatch.
  // The status lives at module scope; see `rearmAfterRefreshStatus` above.
  useEffect(() => {
    if (
      rearmAfterRefreshStatus === 'awaiting-start' &&
      state.renderingIndicator
    ) {
      setRearmStatus('awaiting-end')
    } else if (
      rearmAfterRefreshStatus === 'awaiting-end' &&
      !state.renderingIndicator
    ) {
      setRearmStatus('awaiting-cookie')
      if (typeof cookieStore !== 'undefined') {
        const cookie: InstantCookie = [0, `p${Math.random()}`]
        cookieStore.set({
          name: COOKIE_NAME,
          value: JSON.stringify(cookie),
          path: '/',
        })
      }
    }
  }, [state.renderingIndicator])

  // Clear the rearm status once the new pending cookie has actually landed
  // in the panel's view of cookie state. Until then we keep isRearming true
  // so the UI stays on the "Awaiting navigation..." card.
  useEffect(() => {
    if (
      rearmAfterRefreshStatus === 'awaiting-cookie' &&
      cookieData?.state === 'pending'
    ) {
      setRearmStatus('idle')
    }
  }, [cookieData?.state])

  function handleStopCapturing() {
    // Delete the cookie to release the lock and end the capture session.
    // The CookieStore change event triggers refreshOnInstantNavigationUnlock
    // which does a soft refresh to fetch dynamic data.
    clearInstantNavCaptureCookie()
  }

  function handleContinueRendering() {
    if (typeof cookieStore !== 'undefined') {
      cookieStore.delete(COOKIE_NAME)
      setRearmStatus('awaiting-start')
    }
  }

  // While we're waiting for a "Continue Rendering" -> re-arm to finish,
  // the cookie is briefly absent. Treat that window as pending so the
  // panel keeps showing the "Awaiting navigation..." UI instead of
  // flickering back to idle.
  const isRearming = rearmStatus !== 'idle'
  const isLocked = cookieData !== null || isRearming

  const isPending = cookieData?.state === 'pending' || isRearming
  let status: 'idle' | 'pending' | 'mpa' | 'spa' = 'idle'
  if (cookieData?.state === 'spa') {
    status = 'spa'
  } else if (cookieData?.state === 'mpa') {
    status = 'mpa'
  } else if (cookieData !== null || isRearming) {
    status = 'pending'
  }

  let content
  if (cookieData?.state === 'spa') {
    content = (
      <div className="instant-nav-state-card">
        <h3 className="instant-nav-state-title">Navigation</h3>
        <p className="instant-nav-state-description">
          You're viewing the prefetched UI for the last navigation.
        </p>
        <p
          className="instant-nav-state-source-url"
          title={formatRoutePattern(cookieData.fromTree)}
        >
          Source URL: {formatRoutePattern(cookieData.fromTree)}
        </p>
      </div>
    )
  } else if (cookieData?.state === 'mpa') {
    content = (
      <div className="instant-nav-state-card">
        <h3 className="instant-nav-state-title">Page load</h3>
        <p className="instant-nav-state-description">
          You're viewing the prerendered UI for the current page.
        </p>
      </div>
    )
  } else {
    content = (
      <>
        <p className="instant-nav-intro-description">
          Inspect the UI that will show instantly to users as they navigate
          around your app. Start capturing, then click any link or refresh the
          current page.
        </p>
        <div className="instant-nav-state-card instant-nav-state-card--awaiting">
          <h3 className="instant-nav-state-title">Awaiting navigation...</h3>
          <p className="instant-nav-state-description">
            Click any link or refresh the page.
          </p>
        </div>
      </>
    )
  }

  return (
    <div className="instant-nav-panel">
      <div className="instant-nav-content">
        <div
          className={
            'instant-nav-content-container' +
            (status === 'idle' ? '' : ' is-expanded')
          }
        >
          {content}
        </div>

        <div className="instant-nav-capture-controls">
          {isLocked ? (
            <button
              type="button"
              className="instant-nav-capture-button instant-nav-capture-button--active"
              onClick={handleStopCapturing}
            >
              <StopIcon />
              Stop Capturing
            </button>
          ) : (
            <button
              type="button"
              className="instant-nav-capture-button"
              onClick={handleStartClientNav}
            >
              <RecordIcon />
              Start Capturing
            </button>
          )}
          <button
            type="button"
            className="instant-nav-capture-button instant-nav-capture-button--inline-icon"
            onClick={handleContinueRendering}
            disabled={!isLocked || isPending}
          >
            <PlayIcon />
            Continue Rendering
          </button>
        </div>
      </div>
    </div>
  )
}

function RecordIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <circle cx="8" cy="8" r="3.25" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      width="14"
      height="14"
    >
      <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <rect x="5.5" y="5.5" width="5" height="5" rx="1" fill="currentColor" />
    </svg>
  )
}
