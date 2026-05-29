import { useEffect, useState, useSyncExternalStore } from 'react'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { useDelayedRender } from '../../hooks/use-delayed-render'
import { usePanelRouterContext } from '../../menu/context'
import { ACTION_INSTANT_NAVS_RESET } from '../../shared'
import {
  useInstantNavCookieState,
  formatRoutePattern,
} from './instant-nav-cookie'
import './instant-navs-panel.css'
import type { CSSProperties, ReactNode } from 'react'
import type { InstantCookie } from '../../../../shared/lib/app-router-types'
import type { InstantNavCookieData } from '../../../../shared/lib/instant-nav-cookie'

const COOKIE_NAME = 'next-instant-navigation-testing'
type InstantNavContentStatus = 'idle' | 'pending' | 'mpa' | 'spa'
type InstantNavStatus =
  | InstantNavContentStatus
  // Waiting for the refresh action to start (renderingIndicator -> true).
  | 'rearming-awaiting-start'
  // Refresh in progress, waiting for it to finish (renderingIndicator -> false).
  | 'rearming-awaiting-end'
  // Refresh finished and the new pending cookie has been written; waiting
  // for the CookieStore change event to land so the panel can read it.
  // Keeping the status non-idle through this window prevents a flicker
  // back to the idle UI between cookie write and cookie change event.
  | 'rearming-awaiting-cookie'

// Module-level state machine for the "Continue Rendering" -> re-arm flow.
// The panel is a singleton in the dev overlay, so this is safe. Tracking
// the transition outside React lets us read/write it from both event
// handlers and effects without tripping React Compiler rules. The status
// is exposed to React via a useSyncExternalStore hook so the panel can
// re-render while we wait for the refresh to complete (otherwise the
// panel would flicker back to idle between the cookie delete and re-set).
let instantNavTransientStatus: InstantNavStatus = 'idle'
const instantNavStatusSubscribers = new Set<() => void>()

function setInstantNavTransientStatus(status: InstantNavStatus): void {
  if (instantNavTransientStatus === status) return
  instantNavTransientStatus = status
  for (const sub of instantNavStatusSubscribers) sub()
}

function subscribeInstantNavTransientStatus(cb: () => void): () => void {
  instantNavStatusSubscribers.add(cb)
  return () => instantNavStatusSubscribers.delete(cb)
}

function getInstantNavTransientStatus(): InstantNavStatus {
  return instantNavTransientStatus
}

function isRearmingStatus(
  status: InstantNavStatus
): status is Exclude<InstantNavStatus, InstantNavContentStatus> {
  return status.startsWith('rearming-')
}

function getContentStatus(status: InstantNavStatus): InstantNavContentStatus {
  if (isRearmingStatus(status)) {
    return 'pending'
  }
  return status
}

function getInstantNavStatus(
  cookieData: InstantNavCookieData | null,
  rearmStatus: InstantNavStatus
): InstantNavStatus {
  if (isRearmingStatus(rearmStatus)) {
    return rearmStatus
  }
  if (cookieData?.state === 'spa') {
    return 'spa'
  }
  if (cookieData?.state === 'mpa') {
    return 'mpa'
  }
  if (cookieData !== null) {
    return 'pending'
  }
  return 'idle'
}

function useInstantNavStatus(
  cookieData: InstantNavCookieData | null
): InstantNavStatus {
  const transientStatus = useSyncExternalStore(
    subscribeInstantNavTransientStatus,
    getInstantNavTransientStatus,
    getInstantNavTransientStatus
  )
  return getInstantNavStatus(cookieData, transientStatus)
}

const DURATION = 200

function InstantNavContentTransition({
  status,
  children,
}: {
  status: InstantNavContentStatus
  children: Record<InstantNavContentStatus, ReactNode>
}) {
  const [initialStatus] = useState(status)
  const [hasChangedStatus, setHasChangedStatus] = useState(false)

  if (status !== initialStatus && !hasChangedStatus) {
    setHasChangedStatus(true)
  }

  return (
    <div
      className={
        'instant-nav-content-container' +
        (status === 'idle' ? '' : ' is-expanded')
      }
      style={
        {
          '--instant-nav-transition-duration': `${DURATION}ms`,
          '--instant-nav-transition-half-duration': `${DURATION / 2}ms`,
          '--instant-nav-transition-timing': 'cubic-bezier(0.25, 0.8, 0.5, 1)',
        } as CSSProperties
      }
    >
      <InstantNavTransitionLayer
        active={status === 'idle'}
        enter={hasChangedStatus}
      >
        {children.idle}
      </InstantNavTransitionLayer>
      <InstantNavTransitionLayer
        active={status === 'pending'}
        enter={hasChangedStatus}
      >
        {children.pending}
      </InstantNavTransitionLayer>
      <InstantNavTransitionLayer
        active={status === 'mpa'}
        enter={hasChangedStatus}
      >
        {children.mpa}
      </InstantNavTransitionLayer>
      <InstantNavTransitionLayer
        active={status === 'spa'}
        enter={hasChangedStatus}
      >
        {children.spa}
      </InstantNavTransitionLayer>
    </div>
  )
}

function InstantNavTransitionLayer({
  active,
  enter = true,
  children,
}: {
  active: boolean
  enter?: boolean
  children: ReactNode
}) {
  const { mounted, rendered } = useDelayedRender(active, {
    enterDelay: enter ? 1 : 0,
    exitDelay: DURATION,
  })

  if (!mounted) return null

  const visible = rendered || (active && !enter)
  const entering = active && enter

  return (
    <div
      className={
        'instant-nav-transition-layer' +
        (visible ? ' is-visible' : '') +
        (active && !enter ? ' instant-nav-transition-layer--no-enter' : '')
      }
      aria-hidden={!active}
      style={
        {
          '--instant-nav-layer-opacity': visible ? 1 : 0,
          '--instant-nav-layer-transition-duration':
            'var(--instant-nav-transition-half-duration, 100ms)',
          '--instant-nav-layer-transition-delay': entering
            ? 'var(--instant-nav-transition-half-duration, 100ms)'
            : '0ms',
        } as CSSProperties
      }
    >
      {children}
    </div>
  )
}

function clearInstantNavCaptureCookie(): void {
  setInstantNavTransientStatus('idle')
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

  // State machine for "Continue Rendering" in a captured state (mpa/spa):
  // delete the cookie (which triggers a soft refresh via the lock listener),
  // wait for the refresh to actually complete, then re-arm capture by
  // writing a new pending cookie. We observe completion by watching
  // state.renderingIndicator transition false -> true -> false, which is
  // driven by useTransition's isPending around the refresh dispatch.
  // The transient rearming status lives at module scope so it can be
  // read and written from both event handlers and effects.
  useEffect(() => {
    if (
      instantNavTransientStatus === 'rearming-awaiting-start' &&
      state.renderingIndicator
    ) {
      setInstantNavTransientStatus('rearming-awaiting-end')
    } else if (
      instantNavTransientStatus === 'rearming-awaiting-end' &&
      !state.renderingIndicator
    ) {
      setInstantNavTransientStatus('rearming-awaiting-cookie')
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
      instantNavTransientStatus === 'rearming-awaiting-cookie' &&
      cookieData?.state === 'pending'
    ) {
      setInstantNavTransientStatus('idle')
    }
  }, [cookieData?.state])

  // While we're waiting for a "Continue Rendering" -> re-arm to finish,
  // the cookie is briefly absent. Treat that window as pending so the
  // panel keeps showing the "Awaiting navigation..." UI instead of
  // flickering back to idle.
  const status = useInstantNavStatus(cookieData)
  const contentStatus = getContentStatus(status)
  const isLocked = status !== 'idle'
  const isPending = contentStatus === 'pending'

  const isClosing = panel !== 'instant-navs'
  const [displayStatus, setDisplayStatus] = useState(contentStatus)

  if (!isClosing && displayStatus !== contentStatus) {
    setDisplayStatus(contentStatus)
  }

  const currentSpaSourceUrl =
    cookieData?.state === 'spa' ? formatRoutePattern(cookieData.fromTree) : null
  // Keep the most recent SPA source URL available while the outgoing card fades.
  const [lastSpaSourceUrl, setLastSpaSourceUrl] = useState<string | null>(
    currentSpaSourceUrl
  )

  if (
    currentSpaSourceUrl !== null &&
    currentSpaSourceUrl !== lastSpaSourceUrl
  ) {
    setLastSpaSourceUrl(currentSpaSourceUrl)
  }

  const spaSourceUrl = currentSpaSourceUrl ?? lastSpaSourceUrl

  const content: Record<InstantNavContentStatus, ReactNode> = {
    idle: (
      <p className="instant-nav-intro-description">
        Inspect the UI that will show instantly to users as they navigate around
        your app. Start capturing, then click any link or refresh the current
        page.
      </p>
    ),
    pending: (
      <div className="instant-nav-state-card instant-nav-state-card--awaiting">
        <h3 className="instant-nav-state-title">Awaiting navigation...</h3>
        <p className="instant-nav-state-description">
          Click any link or refresh the page.
        </p>
      </div>
    ),
    mpa: (
      <div className="instant-nav-state-card">
        <h3 className="instant-nav-state-title">Page load</h3>
        <p className="instant-nav-state-description">
          You're viewing the prerendered UI for the current page.
        </p>
      </div>
    ),
    spa: (
      <div className="instant-nav-state-card">
        <h3 className="instant-nav-state-title">Navigation</h3>
        <p className="instant-nav-state-description">
          You're viewing the prefetched UI for the last navigation.
        </p>
        {spaSourceUrl !== null ? (
          <p className="instant-nav-state-source-url" title={spaSourceUrl}>
            Source URL: {spaSourceUrl}
          </p>
        ) : null}
      </div>
    ),
  }

  return (
    <div className="instant-nav-panel">
      <div className="instant-nav-content">
        <InstantNavContentTransition status={displayStatus}>
          {content}
        </InstantNavContentTransition>

        <div className="instant-nav-capture-controls">
          {isLocked ? (
            <button
              type="button"
              className="instant-nav-capture-button instant-nav-capture-button--active"
              onClick={() => {
                // Delete the cookie to release the lock and end the capture session.
                // The CookieStore change event triggers refreshOnInstantNavigationUnlock
                // which does a soft refresh to fetch dynamic data.
                clearInstantNavCaptureCookie()
              }}
            >
              <StopIcon />
              Stop Capturing
            </button>
          ) : (
            <button
              type="button"
              className="instant-nav-capture-button"
              onClick={() => {
                if (typeof cookieStore !== 'undefined') {
                  const cookie: InstantCookie = [0, `p${Math.random()}`]
                  cookieStore.set({
                    name: COOKIE_NAME,
                    value: JSON.stringify(cookie),
                    path: '/',
                  })
                }
              }}
            >
              <RecordIcon />
              Start Capturing
            </button>
          )}
          <button
            type="button"
            className="instant-nav-capture-button instant-nav-capture-button--inline-icon"
            onClick={() => {
              if (typeof cookieStore !== 'undefined') {
                cookieStore.delete(COOKIE_NAME)
                setInstantNavTransientStatus('rearming-awaiting-start')
              }
            }}
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
