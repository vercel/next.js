'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function ChartLegend({ series }) {
  const [hidden, setHidden] = useState([])
  return (
    <div
      className="chart-legend flex items-center gap-2 text-xs"
      role="group"
      aria-label="Chart series"
    >
      {series.map((s) => (
        <button
          key={s.label}
          type="button"
          aria-pressed={!hidden.includes(s.label)}
          onClick={() =>
            setHidden((h) =>
              h.includes(s.label)
                ? h.filter((x) => x !== s.label)
                : [...h, s.label]
            )
          }
        >
          <span className="legend-swatch" style={{ background: s.color }} />
          {s.label}
        </button>
      ))}
    </div>
  )
}
export const __vendor = typeof describeBulkGraph
