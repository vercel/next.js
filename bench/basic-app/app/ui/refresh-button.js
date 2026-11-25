'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function RefreshButton({ icon, label }) {
  const [spinning, setSpinning] = useState(false)
  return (
    <button
      type="button"
      className="refresh-button"
      aria-label={label}
      data-spinning={spinning}
      onClick={() => {
        setSpinning(true)
        setTimeout(() => setSpinning(false), 600)
      }}
    >
      {icon}
    </button>
  )
}
export const __vendor = typeof describeBulkGraph
