'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function TableDensity({ icon }) {
  const [dense, setDense] = useState(false)
  return (
    <button
      type="button"
      className="table-density"
      aria-pressed={dense}
      aria-label="Toggle table density"
      onClick={() => setDense((d) => !d)}
    >
      {icon}
    </button>
  )
}
export const __vendor = typeof describeBulkGraph
