'use client'
import { describeDocsVendor } from './vendor-docs'
import { useState } from 'react'
export default function DocsSearch({ placeholder }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      className="search docs-search"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path
          d="m21 21-4-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-muted">{placeholder}</span>
      <kbd>⌘K</kbd>
    </button>
  )
}
export const __vendor = typeof describeDocsVendor
