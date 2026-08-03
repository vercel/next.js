'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
const RANGES = ['Last 24 hours', 'Last 7 days', 'Last 30 days', 'Last 90 days']
export default function DateRangePicker({ initial }) {
  const [range, setRange] = useState(initial ?? RANGES[3])
  return (
    <label className="date-range text-xs">
      <span className="sr-only">Time range</span>
      <select value={range} onChange={(e) => setRange(e.target.value)}>
        {RANGES.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
    </label>
  )
}
export const __vendor = typeof describeBulkGraph
