'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function ShareMenu({ slug, trigger, items }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="share-menu">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={'Share ' + slug}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open ? (
        <span role="menu" className="share-items">
          {items.map((item) => (
            <button key={item.label} role="menuitem" type="button">
              {item.icon} {item.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
export const __vendor = typeof describeBlogVendor
