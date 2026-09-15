'use client'
import { describeBulkGraph } from './vendor-bulk'
import { useState } from 'react'
export default function HelpMenu({ icon, items }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="help-menu">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Help"
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
      </button>
      {open ? (
        <span className="share-items" role="menu">
          {items.map((item) => (
            <button key={item} role="menuitem" type="button">
              {item}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
export const __vendor = typeof describeBulkGraph
