import { useEffect, useRef } from 'react'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import {
  ACTION_CACHE_ONLY_TOGGLE,
  ACTION_INSTANT_NAV_SET_PHASE,
  ACTION_INSTANT_NAV_RESET,
} from '../../shared'
import { CopyButton } from '../copy-button'
import './instant-nav-panel.css'

export function InstantNavPanel() {
  const { state, dispatch } = useDevOverlayContext()
  const { phase, fromUrl, toUrl } = state.instantNavPanel
  const fromUrlRef = useRef<string>(
    typeof window !== 'undefined' ? window.location.pathname : ''
  )
  const initialPageRef = useRef<string>(state.page)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  // On mount: set cookie and enable cacheOnly
  useEffect(() => {
    // Only set cookie if not already in a result state (e.g. after refresh)
    if (phase === 'waiting') {
      document.cookie = 'next-instant-navigation-testing=1; path=/'
      if (!state.cacheOnly) {
        dispatch({ type: ACTION_CACHE_ONLY_TOGGLE })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup on unmount: clear cookie, turn off cacheOnly, reset state
  useEffect(() => {
    return () => {
      document.cookie =
        'next-instant-navigation-testing=; path=/; max-age=0'

      // Reset panel state
      dispatch({ type: ACTION_INSTANT_NAV_RESET })
      dispatch({ type: ACTION_CACHE_ONLY_TOGGLE })

      // If we were showing results, reload to restore dynamic content
      if (
        phaseRef.current === 'client-nav' ||
        phaseRef.current === 'initial-load'
      ) {
        window.location.reload()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Navigation detection: watch state.page for changes while in waiting state
  useEffect(() => {
    if (phase !== 'waiting') return
    if (!state.page || !initialPageRef.current) return

    if (state.page !== initialPageRef.current) {
      dispatch({
        type: ACTION_INSTANT_NAV_SET_PHASE,
        phase: 'client-nav',
        fromUrl: fromUrlRef.current,
        toUrl: window.location.pathname,
      })
    }
  }, [state.page, phase, dispatch])

  function handleRefresh() {
    // Extend cookie value to signal "initial-load" after reload
    document.cookie = 'next-instant-navigation-testing=initial-load; path=/'
    window.location.reload()
  }

  function getShareUrl(): string {
    const targetUrl = toUrl || window.location.pathname
    const url = new URL(targetUrl, window.location.origin)
    url.searchParams.set('__instant_nav', '1')
    if (phase === 'client-nav' && fromUrl) {
      url.searchParams.set('from', fromUrl)
    }
    return url.toString()
  }

  if (phase === 'waiting') {
    return (
      <div className="instant-nav-panel">
        <p className="instant-nav-description">Navigate to a page...</p>
        <p className="instant-nav-or">or</p>
        <button
          className="instant-nav-refresh-button"
          onClick={handleRefresh}
          data-instant-nav-refresh
        >
          Refresh
        </button>
        <p className="instant-nav-hint">to capture initial page load</p>
      </div>
    )
  }

  if (phase === 'client-nav') {
    return (
      <div className="instant-nav-panel">
        <h4 className="instant-nav-phase-title">Client nav</h4>
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

  if (phase === 'initial-load') {
    return (
      <div className="instant-nav-panel">
        <h4 className="instant-nav-phase-title">Initial Page load</h4>
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
