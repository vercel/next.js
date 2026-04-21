'use client'

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p id="count">Count: {count}</p>
      <button id="increment" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </div>
  )
}
