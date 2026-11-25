'use client'
import { describeUtils } from './vendor-util'
import { useState, useRef, useEffect } from 'react'
export default function Dropdown({ label, items, align = 'end' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <span className="dropdown" ref={ref}>
      <button
        type="button"
        className="dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open ? (
        <ul className={'dropdown-menu align-' + align} role="menu">
          {items.map((item) =>
            typeof item === 'string' ? (
              <li key={item} role="menuitem" className="dropdown-item">
                {item}
              </li>
            ) : (
              <li
                key={item.label}
                role="menuitem"
                className="dropdown-item flex items-center gap-2"
              >
                {item.icon}
                {item.label}
              </li>
            )
          )}
        </ul>
      ) : null}
    </span>
  )
}

export const __layers = [describeUtils].length
