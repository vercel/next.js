'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button id="counter" onClick={() => setCount(count + 1)}>
      {count}
    </button>
  )
}
