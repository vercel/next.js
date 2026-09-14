'use client'
import { describeDocsVendor } from './vendor-docs'
import { useState } from 'react'
export default function AnnouncementBanner({ children }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="announcement" role="status">
      {children}
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
export const __vendor = typeof describeDocsVendor
