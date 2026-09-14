'use client'
import { useState } from 'react'

export default function Collapsible({ summary, defaultOpen, children }) {
  const [open, setOpen] = useState(Boolean(defaultOpen))
  return (
    <section className="collapsible" data-open={open || undefined}>
      <button
        type="button"
        className="collapsible-summary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {summary}
      </button>
      {open ? <div className="collapsible-body">{children}</div> : null}
    </section>
  )
}
