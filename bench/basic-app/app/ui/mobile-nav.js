'use client'
import { describeDocsVendor } from './vendor-docs'
import { useState } from 'react'
export default function MobileNav({ openIcon, closeIcon, label }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      className="mobile-nav-toggle"
      aria-expanded={open}
      aria-label={label}
      onClick={() => setOpen((o) => !o)}
    >
      {open ? closeIcon : openIcon}
    </button>
  )
}
export const __vendor = typeof describeDocsVendor
