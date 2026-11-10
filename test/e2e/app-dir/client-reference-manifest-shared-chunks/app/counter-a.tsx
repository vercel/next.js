'use client'

import { useState } from 'react'

export function CounterA() {
  const [count, setCount] = useState(0)
  return (
    <button id="counter-a" onClick={() => setCount((c) => c + 1)}>
      A: {count}
    </button>
  )
}
