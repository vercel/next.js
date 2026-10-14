'use client'

import { useState } from 'react'

export function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial)
  return (
    <button id="counter" onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  )
}
