'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button id="counter" onClick={() => setCount((value) => value + 1)}>
      count: {count}
    </button>
  )
}
