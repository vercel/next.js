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
    if (!state.page || !initialPageRef.current) return

    if (state.page !== initialPageRef.current) {
      const from = fromUrlRef.current
      const to = window.location.pathname + window.location.search
      // Sync cookie so this state survives a refresh
      document.cookie = `next-instant-navigation-testing=client-nav|${from}|${to}; path=/`
      dispatch({
        type: ACTION_INSTANT_NAVS_SET_STATUS,
        status: 'client-nav',
        fromUrl: from,
        toUrl: to,
      })
    }
  }, [state.page, status, dispatch])

  function handleReload() {
    document.cookie = 'next-instant-navigation-testing=initial-load; path=/'
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
              View the initial static UI for the current page.
            </p>
          </div>
          <div className="instant-nav-section-control">
            <button
              className="action-button"
              onClick={handleReload}
              data-instant-nav-refresh
            >
              <span>View page load</span>
            </button>
          </div>
        </div>
        {/* TODO: Uncomment when ready to integrate with cookie changes that support from/to paths. */}
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
          {/* TODO: Need to implement this feature that maps URL to route module path. */}
          {/* <div className="instant-nav-urls">
            <div className="instant-nav-url-row">
              <span className="instant-nav-url-label">Route:</span>
              <span className="instant-nav-url-value">/target-page/[slug]</span>
            </div>
            <div className="instant-nav-url-row">
              <span className="instant-nav-url-label">From:</span>
              <span className="instant-nav-url-value">{panel.fromUrl}</span>
            </div>
          </div> */}
          <p className="instant-nav-helper-description">
            You're viewing the prefetched UI for the previous navigation to the
            current URL.
          </p>
          <p className="instant-nav-helper-description">
            Edit your code and reload the page to see any changes.
          </p>
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

          {/* TODO: Need to implement this feature that maps URL to route module path. */}
          {/* <div className="instant-nav-urls">
            <div className="instant-nav-url-row">
              <span className="instant-nav-url-label">Route:</span>
              <span className="instant-nav-url-value">/target-page/[slug]</span>
            </div>
          </div> */}
          <p className="instant-nav-helper-description">
            You're viewing the pre-rendered static UI for the current URL.
          </p>
          <p className="instant-nav-helper-description">
            Edit your code and reload the page to see any changes.
          </p>
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
