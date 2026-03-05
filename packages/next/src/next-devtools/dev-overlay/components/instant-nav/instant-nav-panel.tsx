import { useEffect, useRef } from 'react'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import {
  ACTION_CACHE_ONLY_TOGGLE,
  ACTION_INSTANT_NAV_SET_STATUS,
  ACTION_INSTANT_NAV_RESET,
} from '../../shared'
import { CopyButton } from '../copy-button'
import './instant-nav-panel.css'

export function InstantNavPanel() {
  const { state, dispatch } = useDevOverlayContext()
  const { status, fromUrl, toUrl } = state.instantNavPanel
  const fromUrlRef = useRef<string>(
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : ''
  )
  const initialPageRef = useRef<string>(state.page)
  const statusRef = useRef(status)
  statusRef.current = status

  // On mount: set cookie if not already set, and enable cacheOnly
  useEffect(() => {
    if (status === 'waiting') {
      document.cookie = 'next-instant-navigation-testing=waiting; path=/'
    }
    if (!state.cacheOnly) {
      dispatch({ type: ACTION_CACHE_ONLY_TOGGLE })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup on unmount: clear cookie, turn off cacheOnly, reset state
  useEffect(() => {
    return () => {
      document.cookie = 'next-instant-navigation-testing=; path=/; max-age=0'

      // Reset panel state
      dispatch({ type: ACTION_INSTANT_NAV_RESET })
      dispatch({ type: ACTION_CACHE_ONLY_TOGGLE })

      // If we were showing results, reload to restore dynamic content
      if (
        statusRef.current === 'client-nav' ||
        statusRef.current === 'initial-load'
      ) {
        window.location.reload()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // While in waiting state, treat any page unload (e.g. browser reload) as
  // an initial-load capture — same as clicking the Reload button.
  useEffect(() => {
    if (status !== 'waiting') return

    const handleBeforeUnload = () => {
      document.cookie = 'next-instant-navigation-testing=initial-load; path=/'
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [status])

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
        type: ACTION_INSTANT_NAV_SET_STATUS,
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

  function getShareUrl(): string {
    const targetUrl = toUrl || window.location.pathname
    const url = new URL(targetUrl, window.location.origin)
    url.searchParams.set('__instant_nav', '1')
    if (status === 'client-nav' && fromUrl) {
      url.searchParams.set('from', fromUrl)
    }
    return url.toString()
  }

  if (status === 'waiting') {
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
              <ReloadIcon />
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

  if (status === 'client-nav') {
    return (
      <div className="instant-nav-panel">
        <h4 className="instant-nav-status-title">Client nav</h4>
        <div className="instant-nav-urls">
          <div className="instant-nav-url-row">
            <span className="instant-nav-url-label">From:</span>
            <span className="instant-nav-url-value">{fromUrl}</span>
          </div>
          <div className="instant-nav-url-row">
            <span className="instant-nav-url-label">To:</span>
            <span className="instant-nav-url-value">{toUrl}</span>
          </div>
        </div>
        <div className="instant-nav-actions">
          <CopyButton
            data-instant-nav-share
            className="instant-nav-share-button"
            getContent={() => Promise.resolve(getShareUrl())}
            actionLabel="Share"
            successLabel="Copied!"
          />
        </div>
      </div>
    )
  }

  if (status === 'initial-load') {
    return (
      <div className="instant-nav-panel">
        <h4 className="instant-nav-status-title">Initial Page load</h4>
        <div className="instant-nav-urls">
          <div className="instant-nav-url-row">
            <span className="instant-nav-url-label">To:</span>
            <span className="instant-nav-url-value">{toUrl}</span>
          </div>
        </div>
        <div className="instant-nav-actions">
          <CopyButton
            data-instant-nav-share
            className="instant-nav-share-button"
            getContent={() => Promise.resolve(getShareUrl())}
            actionLabel="Share"
            successLabel="Copied!"
          />
        </div>
      </div>
    )
  }

  return null
}

function ReloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}
