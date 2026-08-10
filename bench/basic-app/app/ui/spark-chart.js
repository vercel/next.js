'use client'
import { describeBulkGraph } from './vendor-bulk'
import { describeDataLayer } from './vendor-data'
import { useState } from 'react'
export default function SparkChart({ series, height = 120, labels }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...series.map((d) => d.requests))
  const w = 6
  return (
    <figure className="spark">
      <svg
        width={series.length * w}
        height={height}
        role="img"
        aria-label={labels.title}
      >
        {series.map((d, i) => {
          const total = Math.round((d.requests / max) * (height - 8))
          const cached = Math.round((d.cached / max) * (height - 8))
          return (
            <g
              key={d.day}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={i * w}
                y={height - total}
                width={w - 1.5}
                height={total}
                className="spark-bar"
              />
              <rect
                x={i * w}
                y={height - cached}
                width={w - 1.5}
                height={cached}
                className="spark-bar-cached"
              />
            </g>
          )
        })}
      </svg>
      <figcaption>
        {hover == null
          ? labels.caption
          : `Day ${series[hover].day}: ${series[hover].requests.toLocaleString('en-US')} requests, ${series[hover].cached.toLocaleString('en-US')} cached, ${series[hover].errors} errors`}
      </figcaption>
    </figure>
  )
}

export const __layers = [describeDataLayer].length

export const __bulk = typeof describeBulkGraph
