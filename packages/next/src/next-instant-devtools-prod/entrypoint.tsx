import { startTransition, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import {
  lock,
  unlock,
  useInstantNavCookieState,
  formatRoutePattern,
} from '../next-devtools/shared/instant-navs-cookie'

const LABELS = {
  pending: 'Client navigation',
  spa: 'Client navigation',
  mpa: 'Page load',
}

const DESCRIPTIONS = {
  pending:
    'Click any link in your app to view the prefetched UI for that page.',
  spa: "You're viewing the prefetched UI for the previous navigation to the current URL.",
  mpa: "You're viewing the pre-rendered static UI for the current URL.",
}

function InstantNavigationToggle() {
  const [minimized, setMinimized] = useState(true)
  const cookieData = useInstantNavCookieState()
  const styles = getStyles()

  if (minimized) {
    return (
      <button
        style={styles.indicator}
        onClick={() => setMinimized(false)}
        type="button"
        aria-label="Open Instant Navigation Inspector"
      >
        <NextMark />
      </button>
    )
  }

  const cookieState = cookieData?.state ?? null
  const isIdle = cookieState === null
  const isLocked = cookieState === 'spa' || cookieState === 'mpa'

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span>Instant Navigation Inspector</span>
        <button
          style={styles.closeButton}
          onClick={() => setMinimized(true)}
          type="button"
          aria-label="Minimize Instant Navigation Inspector"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4L12 12M12 4L4 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {isIdle ? (
        <>
          <div style={styles.section}>
            <div>
              <div style={styles.label}>Page load</div>
              <p style={styles.description}>View the initial static UI.</p>
            </div>
            <button
              style={styles.button}
              onClick={() => {
                lock()
                window.location.reload()
              }}
              type="button"
            >
              Reload
            </button>
          </div>
          <div style={styles.sectionLast}>
            <div>
              <div style={styles.label}>Client navigation</div>
              <p style={styles.description}>Freeze the next navigation.</p>
            </div>
            <button style={styles.button} onClick={lock} type="button">
              Start
            </button>
          </div>
        </>
      ) : (
        <div style={styles.body}>
          <div style={styles.label}>{LABELS[cookieState]}</div>
          {cookieData !== null && cookieData.state === 'spa' && (
            <div style={styles.routeRows}>
              <div style={styles.routeRow}>
                <span style={styles.routeLabel}>From:</span>
                <span style={styles.routeValue}>
                  {formatRoutePattern(cookieData.fromTree)}
                </span>
              </div>
              <div style={styles.routeRow}>
                <span style={styles.routeLabel}>To:</span>
                <span style={styles.routeValue}>
                  {cookieData.toTree !== null ? (
                    formatRoutePattern(cookieData.toTree)
                  ) : (
                    <span style={styles.skeleton} />
                  )}
                </span>
              </div>
            </div>
          )}
          <p style={styles.helperText}>{DESCRIPTIONS[cookieState]}</p>
        </div>
      )}

      {!isIdle && (
        <div style={styles.footer}>
          <button style={styles.footerButton} onClick={unlock} type="button">
            {isLocked ? 'Continue rendering' : 'Reset'}
          </button>
        </div>
      )}
    </div>
  )
}

let isMounted = false

export function renderInstantDevTools(): void {
  if (!isMounted) {
    const script = document.createElement('script')
    script.style.display = 'block'
    script.style.position = 'absolute'
    script.setAttribute('data-next-instant-devtools', 'true')

    const container = document.createElement('next-instant-devtools')

    script.appendChild(container)
    document.body.appendChild(script)

    const root = createRoot(container, {
      identifierPrefix: 'nidt-',
      onDefaultTransitionIndicator: () => () => {},
    })

    const shadowRoot = container.attachShadow({ mode: 'open' })

    startTransition(() => {
      root.render(createPortal(<InstantNavigationToggle />, shadowRoot))
    })

    isMounted = true
  }
}

const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

function getStyles() {
  const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
  const bg = isDarkMode ? '#1a1a1a' : '#fff'
  const text = isDarkMode ? '#eee' : '#111'
  const textMuted = isDarkMode ? '#999' : '#666'
  const border = isDarkMode ? '#333' : '#e5e5e5'
  const shadow = isDarkMode
    ? '0 2px 8px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.08)'
    : '0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)'

  return {
    card: {
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 9999,
      width: 280,
      borderRadius: 12,
      fontFamily: FONT,
      fontSize: 14,
      overflow: 'hidden',
      background: bg,
      color: text,
      boxShadow: shadow,
    },
    indicator: {
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 9999,
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: 'rgba(0,0,0,0.8)',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow:
        '0 0 0 1px #171717, inset 0 0 0 1px hsla(0,0%,100%,0.14), 0 16px 32px -8px rgba(0,0,0,0.24)',
      padding: 0,
      overflow: 'hidden',
    },
    header: {
      padding: '10px 16px',
      fontWeight: 600,
      fontSize: 13,
      borderBottom: `1px solid ${border}`,
      letterSpacing: '0.02em',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      color: textMuted,
    },
    closeButton: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 4,
      color: textMuted,
    },
    section: {
      padding: '12px 16px',
      borderBottom: `1px solid ${border}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
    },
    sectionLast: {
      padding: '12px 16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: 500,
      color: text,
      margin: 0,
    },
    description: {
      fontSize: 13,
      color: textMuted,
      margin: '2px 0 0',
    },
    body: {
      padding: '12px 16px',
    },
    helperText: {
      fontSize: 13,
      color: textMuted,
      margin: '6px 0 0',
      lineHeight: 1.5,
    },
    button: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 10px',
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 400,
      color: text,
      cursor: 'pointer',
      fontFamily: FONT,
      flexShrink: 0,
    },
    footer: {
      padding: 8,
      borderTop: `1px solid ${border}`,
    },
    footerButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      padding: 6,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      color: text,
      cursor: 'pointer',
      fontFamily: FONT,
    },
    routeRows: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      marginTop: 8,
    },
    routeRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 13,
    },
    routeLabel: {
      color: textMuted,
      fontWeight: 500,
      flexShrink: 0,
    },
    routeValue: {
      color: text,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    skeleton: {
      display: 'inline-block',
      width: 60,
      height: 12,
      borderRadius: 4,
      background: border,
      verticalAlign: 'middle',
    },
  } as const
}

function NextMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <g transform="translate(13, 13)">
        <path
          d="M13.3 15.2 L2.34 1 V12.6"
          fill="none"
          stroke="url(#next_logo_paint0_linear_1357_10853)"
          strokeWidth="1.86"
          mask="url(#next_logo_mask0)"
          strokeDasharray="29.6"
          strokeDashoffset={0}
        />
        <path
          d="M11.825 1.5 V13.1"
          strokeWidth="1.86"
          stroke="url(#next_logo_paint1_linear_1357_10853)"
          strokeDasharray="11.6"
          strokeDashoffset={0}
        />
      </g>
      <defs>
        <linearGradient
          id="next_logo_paint0_linear_1357_10853"
          x1="9.95555"
          y1="11.1226"
          x2="15.4778"
          y2="17.9671"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="0.604072" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="next_logo_paint1_linear_1357_10853"
          x1="11.8222"
          y1="1.40039"
          x2="11.791"
          y2="9.62542"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="next_logo_mask0">
          <rect width="100%" height="100%" fill="white" />
          <rect width="5" height="1.5" fill="black" />
        </mask>
      </defs>
    </svg>
  )
}
