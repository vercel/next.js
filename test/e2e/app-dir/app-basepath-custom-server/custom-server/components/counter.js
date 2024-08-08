'use client'
import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p id="current-count">Count: {count}</p>
      <button onClick={() => setCount(count + 1)} id="increase-count">
        Increment
      </button>
    </div>
  )
}
