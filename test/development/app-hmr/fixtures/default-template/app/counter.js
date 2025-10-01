'use client'

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <p id="counter-value">Count: {count}</p>
      <button id="increment-button" onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  )
}
