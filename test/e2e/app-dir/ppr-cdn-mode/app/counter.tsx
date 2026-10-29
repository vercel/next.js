'use client'
import { useEffect, useState } from 'react'

// Client state in the static part of every page. It must keep its value
// across the refresh that fills the holes.
export function Counter() {
  const [count, setCount] = useState(0)
  const [isHydrated, setIsHydrated] = useState(false)
  useEffect(() => setIsHydrated(true), [])
  return (
    <button
      id="counter"
      data-is-hydrated={isHydrated ? 'true' : 'false'}
      onClick={() => setCount((c) => c + 1)}
    >
      Count: {count}
    </button>
  )
}
