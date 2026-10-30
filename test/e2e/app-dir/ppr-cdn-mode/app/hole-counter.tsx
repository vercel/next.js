'use client'
import { useState } from 'react'

// Client state inside a hole. It mounts once the refresh has filled the hole.
export function HoleCounter() {
  const [count, setCount] = useState(0)
  return (
    <button id="hole-counter" onClick={() => setCount((c) => c + 1)}>
      Hole count: {count}
    </button>
  )
}
