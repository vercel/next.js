'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function LogViewer({ lines }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? lines : lines.slice(0, 3)
  return (
    <div className="log-viewer mono text-xs">
      {shown.map((line, i) => (
        <div key={i} className="log-line" data-level={line.level}>
          <span className="log-ts">{line.ts}</span> {line.text}
        </div>
      ))}
      <button type="button" onClick={() => setExpanded((e) => !e)}>
        {expanded ? 'Collapse' : `Show ${lines.length - 3} more lines`}
      </button>
    </div>
  )
}
export const __vendor = typeof describeBulkGraph
