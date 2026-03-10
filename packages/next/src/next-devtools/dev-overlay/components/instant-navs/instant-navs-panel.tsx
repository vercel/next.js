import { useEffect, useRef, useState } from 'react'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import {
  ACTION_INSTANT_NAVS_SET_STATUS,
  ACTION_INSTANT_NAVS_RESET,
} from '../../shared'
import './instant-navs-panel.css'

export function InstantNavsPanel() {
  const { state, dispatch } = useDevOverlayContext()
  const { status } = state.instantNavsPanel
  const panel = state.instantNavsPanel
  const fromUrlRef = useRef<string>(
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : ''
  )
  const initialPageRef = useRef<string>(state.page)

  // Cleanup on unmount: clear cookie and reset state
  useEffect(() => {
    return () => {
      // Read cookie before clearing to check if we were showing results
      const match = document.cookie.match(
        /next-instant-navigation-testing=([^;]*)/
      )
      const value = match ? match[1] : null

      document.cookie = 'next-instant-navigation-testing=; path=/; max-age=0'
      dispatch({ type: ACTION_INSTANT_NAVS_RESET })

      // If we were showing results, reload to restore dynamic content
      if (value) {
        window.location.reload()
      }
    }
  }, [dispatch])

  // Navigation detection: watch state.page for changes while in waiting state
  useEffect(() => {
    if (status !== 'waiting') return
    if (!state.page) return

    // Capture the first non-empty page as baseline (state.page starts as '')
    if (!initialPageRef.current) {
      initialPageRef.current = state.page
      return
    }

    if (state.page !== initialPageRef.current) {
      dispatch({
        type: ACTION_INSTANT_NAVS_SET_STATUS,
        status: 'client-nav',
        fromUrl: fromUrlRef.current,
        toUrl: window.location.pathname + window.location.search,
      })
    }
  }, [state.page, status, dispatch])

  function handleReload() {
    // Cookie is already set to '1' from when the panel opened.
    // Just reload — the server will see the cookie and render the static shell.
    window.location.reload()
  }

  function handleContinueRendering() {
    document.cookie = 'next-instant-navigation-testing=; path=/; max-age=0'
    window.location.reload()
  }

  function getShareUrl(): string {
    const targetUrl = 'toUrl' in panel ? panel.toUrl : window.location.pathname
    const url = new URL(targetUrl, window.location.origin)
    url.searchParams.set('__instant_nav', '1')
    if (panel.status === 'client-nav') {
      url.searchParams.set('from', panel.fromUrl)
    }
    return url.toString()
  }

  if (panel.status === 'waiting') {
    return (
      <div className="instant-nav-panel">
        <div className="instant-nav-section">
          <div className="instant-nav-section-header">
            <label>Page load</label>
            <p className="instant-nav-section-description">
              Reload to view the initial static UI for this page.
            </p>
          </div>
          <div className="instant-nav-section-control">
            <button
              className="action-button"
              onClick={handleReload}
              data-instant-nav-refresh
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2.5 8a5.5 5.5 0 0 1 9.68-3.578L11.092 5.5H14.5V2.092l-1.395 1.395A7 7 0 1 0 15 8h-1.5A5.5 5.5 0 0 1 2.5 8Z"
                  fill="currentColor"
                />
              </svg>
              <span>Reload</span>
            </button>
          </div>
        </div>
        <div className="instant-nav-section">
          <div className="instant-nav-section-header">
            <label>Client navigation</label>
            <p className="instant-nav-section-description">
              Click any link in your app to view the prefetched UI for that
              page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (panel.status === 'client-nav') {
    return (
      <div className="instant-nav-panel">
        <div className="instant-nav-content">
          <div className="instant-nav-section-header">
            <label>Client navigation</label>
          </div>
          <div className="instant-nav-urls">
            <div className="instant-nav-url-row">
              <span className="instant-nav-url-label">From:</span>
              <span className="instant-nav-url-value">{panel.fromUrl}</span>
            </div>
            <div className="instant-nav-url-row">
              <span className="instant-nav-url-label">To:</span>
              <span className="instant-nav-url-value">{panel.toUrl}</span>
            </div>
          </div>
          <p className="instant-nav-helper-description">
            You're viewing the prefetched UI for the previous navigation to the
            current URL.
          </p>
          {/* TODO: Add back in after the navigation cookie supports reloads. */}
          {/* <p className="instant-nav-helper-description">
            Edit your code and reload the page to see any changes.
          </p> */}
        </div>
        <div className="instant-nav-footer">
          {/* TODO: Remove hidden wrapper once we add share functionality. */}
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

  if (panel.status === 'initial-load') {
    return (
      <div className="instant-nav-panel">
        <div className="instant-nav-content">
          <div className="instant-nav-section-header">
            <label>Page load</label>
          </div>

          <div className="instant-nav-urls">
            <div className="instant-nav-url-row">
              <span className="instant-nav-url-label">Route:</span>
              <span className="instant-nav-url-value">{panel.toUrl}</span>
            </div>
          </div>
          <p className="instant-nav-helper-description">
            You're viewing the pre-rendered static UI for the current URL.
          </p>
          {/* TODO: Add back in after the navigation cookie supports reloads. */}
          {/* <p className="instant-nav-helper-description">
            Edit your code and reload the page to see any changes.
          </p> */}
        </div>
        <div className="instant-nav-footer">
          {/* TODO: Remove hidden wrapper once we add share functionality. */}
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

  return null
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
