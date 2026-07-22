'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function RegionSelect({ regions, icon }) {
  const [region, setRegion] = useState('all')
  return (
    <label className="region-select text-xs">
      {icon}
      <select value={region} onChange={(e) => setRegion(e.target.value)}>
        <option value="all">All regions</option>
        {regions.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </label>
  )
}
export const __vendor = typeof describeBulkGraph
