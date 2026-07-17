'use client'

import { useState } from 'react'

export function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0)
  return (
    <button id={`${label}-button`} onClick={() => setCount((c) => c + 1)}>
      {label} count: {count}
    </button>
  )
}
