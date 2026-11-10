'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function IncidentBanner({ message, icon }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="incident-banner text-xs" role="status">
      {icon} {message}
      <a href="#">Status page</a>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  )
}
export const __vendor = typeof describeBulkGraph
