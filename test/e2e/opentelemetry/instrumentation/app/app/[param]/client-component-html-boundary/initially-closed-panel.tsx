'use client'

import { useState, type ReactNode } from 'react'

export default function InitiallyClosedPanel({
  children,
}: {
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <section id="closed-panel">
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? children : 'closed'}
    </section>
  )
}
