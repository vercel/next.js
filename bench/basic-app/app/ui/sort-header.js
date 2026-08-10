'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function SortHeader({ label, icon }) {
  const [dir, setDir] = useState(null)
  return (
    <button
      type="button"
      className="sort-header"
      data-dir={dir}
      onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
    >
      {label} {icon}
    </button>
  )
}
export const __vendor = typeof describeBulkGraph
