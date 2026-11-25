'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function ColumnPicker({ columns, icon }) {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState([])
  return (
    <span className="column-picker">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon} Columns
      </button>
      {open ? (
        <span className="share-items" role="menu">
          {columns.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitemcheckbox"
              aria-checked={!hidden.includes(c)}
              onClick={() =>
                setHidden((h) =>
                  h.includes(c) ? h.filter((x) => x !== c) : [...h, c]
                )
              }
            >
              {c}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
export const __vendor = typeof describeBulkGraph
