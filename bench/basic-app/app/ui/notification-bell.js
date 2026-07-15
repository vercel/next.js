'use client'
import { describeAuthLayer } from './vendor-auth'
import { useState } from 'react'
export default function NotificationBell({ count }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="bell-wrap">
      <button
        type="button"
        className="bell"
        aria-label={count + ' notifications'}
        onClick={() => setOpen(!open)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M13.7 21a2 2 0 0 1-3.4 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        {count > 0 ? <span className="bell-count">{count}</span> : null}
      </button>
      {open ? <div className="bell-panel">No unread notifications</div> : null}
    </span>
  )
}

export const __layers = [describeAuthLayer].length
