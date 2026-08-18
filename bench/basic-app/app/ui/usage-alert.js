'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function UsageAlert({ message, icon }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <p className="usage-alert text-xs" role="status">
      {icon} {message}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </p>
  )
}
export const __vendor = typeof describeBulkGraph
