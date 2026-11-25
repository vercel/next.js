'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function FilterChip({ label, icon }) {
  const [removed, setRemoved] = useState(false)
  if (removed) return null
  return (
    <span className="filter-chip text-xs">
      {icon} {label}
      <button
        type="button"
        aria-label={'Remove filter ' + label}
        onClick={() => setRemoved(true)}
      >
        ×
      </button>
    </span>
  )
}
export const __vendor = typeof describeBulkGraph
