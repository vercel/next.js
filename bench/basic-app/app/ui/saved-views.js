'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function SavedViews({ views }) {
  const [active, setActive] = useState(0)
  return (
    <div className="saved-views" role="tablist" aria-label="Saved views">
      {views.map((v, i) => (
        <button
          key={v}
          role="tab"
          type="button"
          aria-selected={i === active}
          onClick={() => setActive(i)}
        >
          {v}
        </button>
      ))}
    </div>
  )
}
export const __vendor = typeof describeBulkGraph
