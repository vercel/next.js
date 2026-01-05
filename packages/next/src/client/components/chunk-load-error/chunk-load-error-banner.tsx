'use client'

import { useCallback, useState, useEffect } from 'react'

// Copy constants (two lines, always)
const HEADLINE = "This page couldn't be fully loaded"
const DETAIL_DEFAULT = "A required file couldn't be loaded."
const DETAIL_OFFLINE = "You're offline."

// Fixed height for stable layout
const BANNER_HEIGHT = 70

const styles = {
  container: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    height: BANNER_HEIGHT,
    padding: '0 20px',
    backgroundColor: '#f5f5f5',
    borderBottom: '1px solid #d4d4d4',
    fontFamily:
      'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    boxSizing: 'border-box' as const,
  },
  spacer: {
    height: BANNER_HEIGHT,
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: 0,
  },
  icon: {
    flexShrink: 0,
    width: '20px',
    height: '20px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  headline: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#171717',
    margin: 0,
    lineHeight: 1.4,
  },
  detail: {
    fontSize: '13px',
    fontWeight: 400,
    color: '#525252',
    margin: 0,
    lineHeight: 1.4,
  },
  button: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#171717',
    backgroundColor: '#fff',
    border: '1px solid #a3a3a3',
    lineHeight: 1,
    flexShrink: 0,
  },
} as const

// Neutral warning icon (circle with exclamation)
function WarningIcon() {
  return (
    <svg
      style={styles.icon}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="9" stroke="#737373" strokeWidth="1.5" />
      <path
        d="M10 5.5V11"
        stroke="#737373"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14" r="1" fill="#737373" />
    </svg>
  )
}

export interface ChunkLoadErrorBannerProps {
  pathname: string
  error: Error
}

export function ChunkLoadErrorBanner(_props: ChunkLoadErrorBannerProps) {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  )

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleReload = useCallback(() => {
    window.location.reload()
  }, [])

  const detail = isOffline ? DETAIL_OFFLINE : DETAIL_DEFAULT

  return (
    <>
      {/* Fixed banner at top of viewport - immune to body margin */}
      <div style={styles.container} role="alert" aria-live="assertive">
        <div style={styles.left}>
          <WarningIcon />
          <div style={styles.content}>
            <p style={styles.headline}>{HEADLINE}</p>
            <p style={styles.detail}>{detail}</p>
          </div>
        </div>
        <button type="button" style={styles.button} onClick={handleReload}>
          Reload page
        </button>
      </div>
      {/* Spacer to push content down */}
      <div style={styles.spacer} />
    </>
  )
}
