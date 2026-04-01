import { useEffect, useState } from 'react'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { ACTION_INSTANT_NAVS_RESET } from '../../shared'
import {
  useInstantNavCookieState,
  formatRoutePattern,
} from './instant-nav-cookie'
import './instant-navs-panel.css'

const COOKIE_NAME = 'next-instant-navigation-testing'

export function InstantNavsPanel() {
  const { state, dispatch } = useDevOverlayContext()

  // The cookie is the sole source of truth for the instant navigation
  // state, including the from-route URL for SPA captures.
  const cookieData = useInstantNavCookieState()

  // Whether the user has clicked "Start" to begin capturing a client
  // navigation. This is UI-only state — it controls which panel view
  // is shown while waiting for a navigation to occur. Once a capture
  // completes (state becomes 'spa' or 'mpa'), the waiting state
  // is no longer relevant.
  const [isWaitingForClientNav, setIsWaitingForClientNav] = useState(false)
  if (
    isWaitingForClientNav &&
    cookieData !== null &&
    (cookieData.state === 'spa' || cookieData.state === 'mpa')
  ) {
    setIsWaitingForClientNav(false)
  }

  // Cleanup on unmount: clear cookie and close the panel.
  useEffect(() => {
    return () => {
      if (typeof cookieStore !== 'undefined') {
        cookieStore.delete(COOKIE_NAME)
      }
      dispatch({ type: ACTION_INSTANT_NAVS_RESET })
    }
  }, [dispatch])

  function handleReload() {
    if (typeof cookieStore !== 'undefined') {
      cookieStore.set({
        name: COOKIE_NAME,
        value: JSON.stringify([0, `p${Math.random()}`]),
        path: '/',
      })
    }
    window.location.reload()
  }

  function handleStartClientNav() {
    if (typeof cookieStore !== 'undefined') {
      cookieStore.set({
        name: COOKIE_NAME,
        value: JSON.stringify([0, `p${Math.random()}`]),
        path: '/',
      })
    }
    setIsWaitingForClientNav(true)
  }

  function handleContinueRendering() {
    // Delete the cookie to release the lock. The CookieStore change
    // event triggers refreshOnInstantNavigationUnlock which does a
    // soft refresh to fetch dynamic data. The panel stays open so
    // the user can start another capture.
    if (typeof cookieStore !== 'undefined') {
      cookieStore.delete(COOKIE_NAME)
    }
  }

  function getShareUrl(): string {
    const url = new URL(state.page, window.location.origin)
    url.searchParams.set('__instant_nav', '1')
    if (cookieData !== null && cookieData.state === 'spa') {
      url.searchParams.set('from', formatRoutePattern(cookieData.fromTree))
      if (cookieData.toTree !== null) {
        url.searchParams.set('to', formatRoutePattern(cookieData.toTree))
      }
    }
    return url.toString()
  }

  // Derive the panel view from the cookie state.
  if (cookieData !== null && cookieData.state === 'spa') {
    const isRendering = state.renderingIndicator
    return (
      <div className="instant-nav-panel">
        <div className="instant-nav-content">
          <div className="instant-nav-section-header">
            <label>Client navigation</label>
          </div>
          <div className="instant-nav-urls">
            <div className="instant-nav-url-row">
              <span className="instant-nav-url-label">From:</span>
              <span className="instant-nav-url-value">
                {formatRoutePattern(cookieData.fromTree)}
              </span>
            </div>
            <div className="instant-nav-url-row">
              <span className="instant-nav-url-label">To:</span>
              <span className="instant-nav-url-value">
                {cookieData.toTree !== null && !isRendering ? (
                  formatRoutePattern(cookieData.toTree)
                ) : (
                  <span className="instant-nav-skeleton" />
                )}
              </span>
            </div>
          </div>
          <p className="instant-nav-helper-description">
            You're viewing the prefetched UI for the previous navigation to the
            current URL.
          </p>
        </div>
        <div className="instant-nav-footer">
          <span style={{ display: 'none' }}>
            <ShareButton getShareUrl={getShareUrl} />
          </span>
          <button
            className="instant-nav-footer-button"
            onClick={handleContinueRendering}
            type="button"
          >
            Continue rendering
          </button>
        </div>
      </div>
    )
  }

  if (cookieData !== null && cookieData.state === 'mpa') {
    return (
      <div className="instant-nav-panel">
        <div className="instant-nav-content">
          <div className="instant-nav-section-header">
            <label>Page load</label>
          </div>
          <div className="instant-nav-urls">
            <div className="instant-nav-url-row">
              <span className="instant-nav-url-label">Route:</span>
              <span className="instant-nav-url-value">
                {state.tree !== null && !state.renderingIndicator ? (
                  formatRoutePattern(state.tree)
                ) : (
                  <span className="instant-nav-skeleton" />
                )}
              </span>
            </div>
          </div>
          <p className="instant-nav-helper-description">
            You're viewing the pre-rendered static UI for the current URL.
          </p>
        </div>
        <div className="instant-nav-footer">
          <span style={{ display: 'none' }}>
            <ShareButton getShareUrl={getShareUrl} />
          </span>
          <button
            className="instant-nav-footer-button"
            onClick={handleContinueRendering}
            type="button"
          >
            Continue rendering
          </button>
        </div>
      </div>
    )
  }

  if (isWaitingForClientNav) {
    return (
      <div className="instant-nav-panel">
        <div className="instant-nav-content">
          <div className="instant-nav-section-header">
            <label>Client navigation</label>
          </div>
          <p className="instant-nav-helper-description">
            Click any link in your app to view the prefetched UI for that page.
          </p>
        </div>
      </div>
    )
  }

  // Default: no cookie or pending — show the action buttons.
  return (
    <div className="instant-nav-panel">
      <div className="instant-nav-section">
        <div className="instant-nav-section-header">
          <label>Page load</label>
          <p className="instant-nav-section-description">
            View the initial static UI for this page.
          </p>
        </div>
        <div className="instant-nav-section-control">
          <button
            className="action-button"
            onClick={handleReload}
            data-instant-nav-refresh
          >
            <RotateClockwise />
            <span>Reload</span>
          </button>
        </div>
      </div>
      <div className="instant-nav-section">
        <div className="instant-nav-section-header">
          <label>Client navigation</label>
          <p className="instant-nav-section-description">
            Freeze the next navigation to view the prefetched UI.
          </p>
        </div>
        <div className="instant-nav-section-control">
          <button
            className="action-button"
            onClick={handleStartClientNav}
            data-instant-nav-client
          >
            <span>Start</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function ShareButton({ getShareUrl }: { getShareUrl: () => string }) {
  const [copied, setCopied] = useState(false)

  function handleClick() {
    navigator.clipboard.writeText(getShareUrl()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      className="instant-nav-footer-button"
      onClick={handleClick}
      type="button"
      data-instant-nav-share
    >
      {copied ? 'Copied!' : 'Share'}
    </button>
  )
}

function RotateClockwise() {
  return (
    <svg
      width="14"
      height="14"
      strokeLinejoin="round"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.5 8C2.5 4.96643 4.97431 2.5 8.03548 2.5C10.5716 2.5 12.7064 4.19393 13.3628 6.5H10.75H10V8H10.75H15.25C15.6642 8 16 7.66421 16 7.25V2.75V2H14.5V2.75V5.23347C13.4215 2.74164 10.9316 1 8.03548 1C4.1539 1 1 4.13001 1 8C1 11.87 4.1539 15 8.03548 15C10.3763 15 12.4513 13.8617 13.7295 12.1122L14.172 11.5066L12.9609 10.6217L12.5184 11.2273C11.5117 12.6051 9.87945 13.5 8.03548 13.5C4.97431 13.5 2.5 11.0336 2.5 8Z"
        fill="currentColor"
      />
    </svg>
  )
}
