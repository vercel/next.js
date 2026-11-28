'use client'

import { useState, type ReactNode } from 'react'

// A nested level: renders its name, and a button that only reacts after hydration. A level can be
// rendered more than once on a page (x is reached through a, c and y), so it is identified by class.
export function Level({
  name,
  children,
}: {
  name: string
  children?: ReactNode
}) {
  const [clicked, setClicked] = useState(false)
  return (
    <div>
      <p className={`${name}-text`}>{name}</p>
      <button
        className={`level-button ${name}-button`}
        onClick={() => setClicked(true)}
      >
        {clicked ? `${name}-clicked` : name}
      </button>
      {children}
    </div>
  )
}
