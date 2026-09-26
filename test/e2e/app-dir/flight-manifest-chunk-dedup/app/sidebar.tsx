'use client'
import React, { useState } from 'react'

export function Sidebar() {
  const [open, setOpen] = useState(false)
  return (
    <aside id="client-sidebar" onClick={() => setOpen(!open)}>
      Sidebar: {open ? 'Open' : 'Closed'}
    </aside>
  )
}
