'use client'

import { useState } from 'react'

export default function Page() {
  const [count, setCount] = useState(0)

  return (
    <button id="counter" onClick={() => setCount((value) => value + 1)}>
      Count: {count}
    </button>
  )
}
