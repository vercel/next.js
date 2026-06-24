import { useEffect, useState, useSyncExternalStore } from 'react'
import type { InstantCookie } from '../../../../shared/lib/app-router-types'
import type { InstantNavCookieData } from '../../../../shared/lib/instant-nav-cookie'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { useDelayedRender } from '../../hooks/use-delayed-render'
import { usePanelRouterContext } from '../../menu/context'
import { ACTION_INSTANT_NAVS_RESET } from '../../shared'
import {
  formatRoutePattern,
  useInstantNavCookieState,
} from './instant-nav-cookie'
import './instant-navs-panel.css'

const COOKIE_NAME = 'next-instant-navigation-testing'
type InstantNavContentStatus = 'idle' | 'pending' | 'mpa' | 'spa'
// During a "Resume" restart the cookie is briefly absent (it's
// deleted, then re-written as a new pending cookie). The transient "restarting"
// status keeps the panel on "Awaiting navigation..." across that gap instead
// of flickering back to idle until the new pending cookie lands.
type InstantNavStatus = InstantNavContentStatus | 'restarting'

// Transient restart status held at module scope. The panel is a singleton in
// the dev overlay, so this is safe, and it lets us set the status from the
// click handler and clear it from an effect without tripping React Compiler
// rules. It's exposed to React via a useSyncExternalStore hook so the panel
// re-renders (and stays on "Awaiting navigation...") between the cookie delete
// and the new pending cookie landing.
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

function isRestartingStatus(
  status: InstantNavStatus
): status is Exclude<InstantNavStatus, InstantNavContentStatus> {
  return status === 'restarting'
}

function getContentStatus(status: InstantNavStatus): InstantNavContentStatus {
  if (isRestartingStatus(status)) {
    return 'pending'
  }
  return status
}

function getInstantNavStatus(
  cookieData: InstantNavCookieData | null,
  restartStatus: InstantNavStatus
): InstantNavStatus {
  if (isRestartingStatus(restartStatus)) {
    return restartStatus
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

const DURATION = 400
const EXPANDED_HEIGHT = 225

function createPendingInstantNavCookie(): InstantCookie {
  return [0, `p${Math.random()}`]
}

function setPendingInstantNavCookie(): void {
  if (typeof cookieStore !== 'undefined') {
    cookieStore.set({
      name: COOKIE_NAME,
      value: JSON.stringify(createPendingInstantNavCookie()),
      path: '/',
    })
  }
}

function getCurrentLocationUrl(): string {
  if (typeof window === 'undefined') {
    return '/'
  }
  return window.location.pathname + window.location.search
}

// Ends the capture: deleting the cookie triggers the CookieStore handler in
// navigation-testing-lock.ts, which releases the lock and soft-refreshes to real data.
function clearInstantNavCaptureCookie(): void {
  setInstantNavTransientStatus('idle')
  if (typeof cookieStore !== 'undefined') {
    cookieStore.delete(COOKIE_NAME)
  }
}

export function InstantNavsPanel() {
  const { dispatch } = useDevOverlayContext()
  const { panel } = usePanelRouterContext()

  // The cookie is the sole source of truth for the instant navigation
  // state, including the from-route URL for SPA captures.
  const cookieData = useInstantNavCookieState()

  // Reset UI state only, not the cookie: unmount also fires on Fast Refresh
  // remounts, where ending an active capture would be wrong.
  useEffect(() => {
    return () => {
      setInstantNavTransientStatus('idle')
      dispatch({ type: ACTION_INSTANT_NAVS_RESET })
    }
  }, [dispatch])

  // Leaving the instant panel (menu/logo, X, ESC) ends the capture. The error
  // overlay is the exception: it keeps `panel` as 'instant-navs' and only moves
  // the panel behind it, so this effect never fires and the capture survives.
  useEffect(() => {
    if (panel !== 'instant-navs') {
      clearInstantNavCaptureCookie()
      dispatch({ type: ACTION_INSTANT_NAVS_RESET })
    }
  }, [panel, dispatch])

  // Clear the transient restarting status once the new pending cookie has landed
  // in the panel's view of cookie state, handing the UI back to the cookie.
  useEffect(() => {
    if (
      instantNavTransientStatus === 'restarting' &&
      cookieData?.state === 'pending'
    ) {
      setInstantNavTransientStatus('idle')
    }
  }, [cookieData?.state])

  // While we're waiting for a "Resume" -> restart to finish,
  // the cookie is briefly absent. Treat that window as pending so the
  // panel keeps showing the "Waiting for navigation..." UI instead of
  // flickering back to idle.
  const status = useInstantNavStatus(cookieData)
  const contentStatus = getContentStatus(status)
  const isLocked = status !== 'idle'

  const isClosing = panel !== 'instant-navs'
  const [displayStatus, setDisplayStatus] = useState(contentStatus)

  if (!isClosing && displayStatus !== contentStatus) {
    setDisplayStatus(contentStatus)
  }

  const currentSpaFromUrl =
    cookieData?.state === 'spa' ? formatRoutePattern(cookieData.fromTree) : null
  const currentSpaToUrl =
    cookieData?.state === 'spa' && cookieData.toTree !== null
      ? formatRoutePattern(cookieData.toTree)
      : null

  // Keep the most recent SPA URLs available while the outgoing card fades.
  const [lastSpaFromUrl, setLastSpaFromUrl] = useState<string | null>(
    currentSpaFromUrl
  )
  const [lastSpaToUrl, setLastSpaToUrl] = useState<string | null>(
    currentSpaToUrl
  )

  if (currentSpaFromUrl !== null && currentSpaFromUrl !== lastSpaFromUrl) {
    setLastSpaFromUrl(currentSpaFromUrl)
  }

  if (currentSpaToUrl !== null && currentSpaToUrl !== lastSpaToUrl) {
    setLastSpaToUrl(currentSpaToUrl)
  }

  const spaFromUrl = currentSpaFromUrl ?? lastSpaFromUrl
  const spaToUrl = currentSpaToUrl ?? lastSpaToUrl

  async function resume(): Promise<void> {
    if (typeof cookieStore !== 'undefined') {
      // Resume: delete the cookie (which releases the
      // lock and triggers a soft refresh for real data via the lock
      // listener), then restart capture for the next navigation by
      // writing a fresh pending cookie. Chaining the writes keeps
      // them as two ordered cookie events (delete -> refresh, then
      // restart) rather than coalescing into one, so the refresh runs
      // and snapshots the released lock before the restart re-acquires it.
      setInstantNavTransientStatus('restarting')
      const pendingCookie: InstantCookie = [0, `p${Math.random()}`]
      await cookieStore.delete(COOKIE_NAME)
      cookieStore.set({
        name: COOKIE_NAME,
        value: JSON.stringify(pendingCookie),
        path: '/',
      })
    }
  }

  function togglePaused(): void {
    if (isLocked) {
      clearInstantNavCaptureCookie()
    } else {
      setPendingInstantNavCookie()
    }
  }

  // These two pieces of state are used to preserve the panel's contents
  // during the collapsing animation.
  const { mounted } = useDelayedRender(status !== 'idle', {
    exitDelay: DURATION,
  })
  const [renderedStatus, setRenderedStatus] = useState(status)
  if (status !== renderedStatus && ['pending', 'mpa', 'spa'].includes(status)) {
    setRenderedStatus(status)
  }

  const containerHeight = status === 'idle' ? 0 : EXPANDED_HEIGHT

  // This preserves whatever the last height of the expandable container was
  // when the entire panel is dismissed (via ESC or by pressing X) so that
  // its height doesn't change during the fade-out animation. We only freeze
  // the height while leaving the panel; re-entering it must reset back to
  // null so the container can size to its content again. Otherwise, reopening
  // the panel before it unmounts (it stays mounted briefly for the fade-out)
  // would leave the height frozen at the dismissed value (e.g. 0), keeping
  // the panel permanently collapsed.
  const [previousPanel, setPreviousPanel] = useState(panel)
  const [exitingHeight, setExitingHeight] = useState<null | number>(null)
  if (previousPanel !== panel) {
    setPreviousPanel(panel)
    setExitingHeight(panel === 'instant-navs' ? null : containerHeight)
  }

  return (
    <div className="instant-nav-panel">
      <div className="instant-nav-content">
        <div
          className="instant-nav-content-container"
          style={{
            transition: `height ${DURATION}ms cubic-bezier(0.36, 0.66, 0.04, 1)`,
            height: exitingHeight !== null ? exitingHeight : containerHeight,
          }}
        >
          {mounted && (
            <div style={{ height: EXPANDED_HEIGHT }}>
              {renderedStatus === 'pending' ? (
                <div className=" instant-nav-state--pending">
                  <div className="instant-nav-waiting-status">
                    <span className="instant-nav-waiting-status-dot" />
                    <h3 className="instant-nav-waiting-status-title">
                      Waiting for navigation...
                    </h3>
                  </div>
                  <p className="instant-nav-waiting-description">
                    Click any link or refresh the page to inspect the shell.
                  </p>
                </div>
              ) : renderedStatus === 'mpa' ? (
                <div className="">
                  <DebuggerPausedButton onClick={resume} />
                  <div className="instant-nav-state-details">
                    <h3 className="instant-nav-state-title">
                      Loading shell
                      <span className="instant-nav-state-title-type">
                        Page load
                      </span>
                    </h3>
                    <p className="instant-nav-state-description">
                      You're viewing the shell for this page's initial load.
                    </p>
                    <UrlRow label="Target" value={getCurrentLocationUrl()} />
                  </div>
                </div>
              ) : renderedStatus === 'spa' ? (
                <div className="">
                  <DebuggerPausedButton onClick={resume} />
                  <div className="instant-nav-state-details">
                    <h3 className="instant-nav-state-title">
                      Loading shell
                      <span className="instant-nav-state-title-type">
                        Client nav
                      </span>
                    </h3>
                    <p className="instant-nav-state-description">
                      You're viewing the shell for the current navigation.
                    </p>
                    <div className="instant-nav-state-url-list">
                      {spaFromUrl !== null ? (
                        <UrlRow label="Source" value={spaFromUrl} />
                      ) : null}
                      {spaToUrl !== null ? (
                        <UrlRow label="Target" value={spaToUrl} />
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <PauseControl checked={isLocked} onClick={togglePaused} />
    </div>
  )
}

function DebuggerPausedButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="instant-nav-debugger-paused">
      <InfoIcon />
      <span>Debugger paused</span>
      <button
        type="button"
        className="instant-nav-debugger-paused-button"
        onClick={onClick}
        aria-label="Resume"
      >
        Resume
        <PlayIcon />
      </button>
    </div>
  )
}

function PauseControl({
  checked,
  onClick,
}: {
  checked: boolean
  onClick: () => void
}) {
  return (
    <div className="instant-nav-pause-control">
      <div className="instant-nav-pause-copy">
        <label htmlFor="instant-nav-pause-toggle">Pause on navigations</label>
        <p>
          When enabled, every navigation will pause so you can inspect the
          loading shell before resuming.
        </p>
      </div>
      <button
        id="instant-nav-pause-toggle"
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Pause on navigations"
        className="instant-nav-pause-toggle"
        onClick={onClick}
      >
        <span className="instant-nav-pause-toggle-thumb" />
      </button>
    </div>
  )
}

function UrlRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="instant-nav-url-row">
      <span className="instant-nav-url-label">{label}</span>
      <span className="instant-nav-url-value" title={value}>
        {value}
      </span>
    </div>
  )
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      height="16"
      width="16"
      aria-hidden="true"
      style={{ color: 'currentcolor' }}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16M6.25 7h1.5a1 1 0 0 1 1 1v4.25h-1.5V8.5h-1zM8 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2"
        clipRule="evenodd"
      ></path>
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
    </svg>
  )
}
