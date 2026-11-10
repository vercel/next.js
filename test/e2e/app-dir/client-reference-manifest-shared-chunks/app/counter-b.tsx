'use client'

import { useState } from 'react'

export function CounterB() {
  const [count, setCount] = useState(0)
  return (
    <button id="counter-b" onClick={() => setCount((c) => c + 1)}>
      B: {count}
    </button>
  )
}
